/* For license information please see KEYZEN-LICENSE.txt */
'use strict';

const MAX_NGRAM_SIZE = 3;
const DATA_CURRENT_VERISON = 3;
const LATENCY_LIMIT_MILLIS = 500;
const C = 20;

var data, layouts, audio, keyPresses, key_pressed_timestamp, corpus, confetti, character_stats_worker_message, restricted_ngrams;
var ngram_buf_main = [];
const character_stats_worker = new Worker('character_stats_worker.js');
character_stats_worker.onmessage = (e) => {
    character_stats_worker_message = e.data;
}


function download_object(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([JSON.stringify(content)], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href)
}


function load_db_from_file(evt) {
    const reader = new FileReader();
    reader.readAsText(evt.files[0]);
    reader.onload = function (evt) {
        data = JSON.parse(evt.target.result);
        update_character_stats().then();
        initialize_ngram_db(corpus);
        next_word();
    }
}


function load_ngrams_from_file(evt) {
    const reader = new FileReader();
    reader.readAsText(evt.files[0]);
    reader.onload = function (evt) {
        restricted_ngrams = new Set(evt.target.result.trim().split(" "));
        alert(`loaded ${restricted_ngrams.size} ngrams for restriction`);
        document.getElementById("load-ngrams-from-file-btn").textContent = `Loaded ngram restrictions on (${(new Date()).toString()})`;
        update_character_stats().then();
        initialize_ngram_db(corpus);
        next_word();
    }
}


function render_character_stats() {
    if (_.isNil(character_stats_worker_message)) return;
    const pc = document.createElement("div");
    pc.setAttribute("id", "progress-container");
    character_stats_worker_message.forEach(row => {
        const pi = document.createElement("div")
        pi.setAttribute("class", "progress-item");
        pi.style.top = `${row.top}px`;
        pi.style.left = `${row.left}%`;
        pi.textContent = row.item;
        const ls = document.createElement("div");
        ls.setAttribute("class", "latency-stats");
        ls.textContent = row.rounded_latency;
        pi.appendChild(ls);
        pc.appendChild(pi);
    });
    document.getElementById("progress-container").replaceWith(pc);
    character_stats_worker_message = null;
}


function reset_database_clicked() {
    reset_database();
    save();
    window.location.replace("?time=" + Date.now()); // dummy cache busting parameter
}


function word_to_ngrams(word, ngram_size) {
    let ngrams_buf = [];
    let ngram_buf = [];
    for (let i = 0; i < word.length; i++) {
        ngram_buf.push(word[i]);
        if (ngram_buf.length == ngram_size) {
            ngrams_buf.push(ngram_buf.join(""));
        } else if (ngram_buf.length >= ngram_size) {
            ngram_buf = ngram_buf.slice(1, ngram_size + 1);
            ngrams_buf.push(ngram_buf.join(""));
        }
    }
    return ngrams_buf;
}


function initialize_ngram_db(corpus) {
    for (const ngram_size_minus_1 of Array(MAX_NGRAM_SIZE).keys()) {
        corpus.forEach(word => {
            word_to_ngrams(word, ngram_size_minus_1 + 1).forEach(ngram => {
                if (!(ngram in data.item_performance)) {
                    data.item_performance[ngram] = { alpha: 1, beta: 1, seen: 0 }
                }
            });
        });
    }
}


function reset_database() {
    data = {};
    layouts = {};
    audio = {};
    keyPresses = {};
    // use null to signal that the word was regenerated and reject a prior time delta
    key_pressed_timestamp = null;
    data.version = DATA_CURRENT_VERISON;
    layouts["letters"] = "qwertyuiopasdfghjklzxcvbnm";
    const default_layout = 'letters';
    data.chars = layouts[default_layout];
    data.current_layout = default_layout;
    data.item_performance = {};
    ngram_buf_main = [];

    // process corpuses
    corpus = new Set();
    _.forEach(corncob_lowercase.split("\n"), (current_word) => {
        const current_word_cleaned = current_word.trim().toLowerCase();
        if (Array.from(current_word_cleaned).every((char) => { return data.chars.includes(char) })) {
            corpus.add(current_word_cleaned);
        }
    });
    corpus = Array.from(corpus);  // array is needed for random sampling, otherwise it will be recalculated many times implicitly
    initialize_ngram_db(corpus);
    load_audio();
}


function get_ngram_size() {
    return +document.querySelector('input[name="ngram"]:checked').value;
}


function char_to_key(e) {
    let key = null;
    if (data.layout_mapping_enabled && layout_maps[get_current_layout()]) {
        const layout = get_current_layout();
        key = map_key(e, layout);
    }
    return key || String.fromCharCode(e.which);
}


function map_key(e, layout) {
    const map = layout_maps[layout] || {};
    const fallback_map = layout_maps['qwerty'] || {};
    const code = e.code;
    if (e.shiftKey) {
        return (map.shiftLayer || {})[code] || (fallback_map.shiftLayer || {})[code]
            || ((map[code] || fallback_map[code]) || '').toUpperCase();
    }
    return map[code] || fallback_map[code];
}


function keydownHandler(e) {
    if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        ngram_buf_main = [];
        key_pressed_timestamp = null;  // reset latency counter
        data.word_index = 0;
        data.keys_hit = "";
        data.word_errors = {};
        render_word();
        return;
    }
    const keys = [e.key, char_to_key(e)];
    if (keys.indexOf('Backspace') >= 0) {
        e.preventDefault();
        ngram_buf_main = [];
        key_pressed_timestamp = null;  // reset latency counter
        play_key_audio_sample("correct", 'Backspace');
        if (data.word_index > 0) {
            data.word_index -= 1;
            data.keys_hit = data.keys_hit.slice(0, -1);
            render_word();
        }
        return;
    } else if (keys.indexOf('Enter') >= 0
        || keys.indexOf(' ') >= 0 && data.word_index >= data.word.length) {
        e.preventDefault();
        ngram_buf_main = [];
        play_key_audio_sample("correct", 'Enter');
        next_word();
        return;
    }
    if (e.key === 'Dead') {
        e.preventDefault();
        keyHandler(e);
        keyPresses[e.code] = false;
        return;
    }
}


function keyupHandler(e) {
    keyPresses[e.code] = false;
}


function item_reward(latency, is_correct) {
    // lesser performance on the item maximizes reward (so we can study/practice it more)
    if (is_correct === 0) { return 1; }
    const latency_limited = _.min([LATENCY_LIMIT_MILLIS, latency]);
    return latency_limited / LATENCY_LIMIT_MILLIS;
}


function confetti_enabled() {
    return document.getElementById("use-confetti").checked;
}


function party() {
    if (_.isNil(confetti)) { return; }
    confetti.addConfetti();
}


function update_score(item, reward) {
    if (data.item_performance[item].seen === 0 && confetti_enabled()) { party(); }
    const params = data.item_performance[item]
    let alpha_new = params.alpha + reward;
    let beta_new = params.beta + (1 - reward);
    if ((params.alpha + params.beta) >= C) {
        alpha_new *= C / (C + 1);
        beta_new *= C / (C + 1);
    }
    data.item_performance[item].alpha = alpha_new;
    data.item_performance[item].beta = beta_new;
    data.item_performance[item].seen += 1;
}


function keyHandler(e) {
    if (keyPresses[e.code] || data.word_index >= data.word.length) return;
    keyPresses[e.code] = true;

    var key = char_to_key(e);
    if (data.chars.indexOf(key) < 0) {
        console.warn(`Key not found: ${key}`);
    }
    data.keys_hit += key;
    const desired_letter = data.word[data.word_index];

    let is_correct = false;
    if (key == desired_letter) {
        if (data.word_errors[data.word_index]) {
            data.word_errors[data.word_index] = 'correctedChar';
        }
        play_key_audio_sample("correct", key);
        is_correct = true;
    }
    else {
        play_key_audio_sample("mistake", key);
        data.word_errors[data.word_index] = true;
    }

    ngram_buf_main.push(desired_letter);
    if (key_pressed_timestamp !== null) {
        const ngram_size = get_ngram_size();
        const latency = Date.now() - key_pressed_timestamp;
        key_pressed_timestamp = Date.now();
        const reward = item_reward(latency, is_correct);
        let item;
        if (ngram_buf_main.length == ngram_size) {
            item = ngram_buf_main.join("");
            update_score(item, reward);
        } else if (ngram_buf_main.length >= ngram_size) {
            ngram_buf_main = ngram_buf_main.slice(1, ngram_size + 1);
            item = ngram_buf_main.join("");
            update_score(item, reward);
        }
    } else {
        key_pressed_timestamp = Date.now();
    }

    data.word_index += 1;
    if (data.word_index >= data.word.length && !Object.values(data.word_errors).includes(true)) {
        play_next_word_audio_sample();
        next_word();
    }
    render_word();
}


function next_word() {
    // do not continue if there are typos in the text
    if (!_.isNil(data.word_errors) && Object.values(data.word_errors).includes(true)) return;
    data.word = generate_word();
    data.word_index = 0;
    data.keys_hit = "";
    data.word_errors = {};
    ngram_buf_main = [];
    update_character_stats().then();
    render_character_stats();
    render_word();
    save();
}


function save() {
    localStorage.data = JSON.stringify(data);
}


function load() {
    const data_temp = JSON.parse(localStorage.data);
    if (data_temp.hasOwnProperty("version") && data_temp.version === DATA_CURRENT_VERISON) {
        data = data_temp;
    }
}


function load_audio() {
    audio.correct = [];
    for (let i = 0; i < data.chars.length + 1; i++) {
        audio.correct[i] = new Audio('vendor/click.mp3')
    }
    audio.mistake = []
    for (let i = 0; i < data.chars.length + 1; i++) {
        audio.mistake[i] = new Audio('vendor/clack.mp3')
    }
    audio.next_word = new Audio("vendor/poker_card_flick.mp3")
}


function play_next_word_audio_sample() {
    audio.next_word.currentTime = 0;
    audio.next_word.play().catch(error => { });
}


function play_key_audio_sample(soundname, key) {
    // since unknown keys return -1, adding one gives us an index of zero
    // make sure the buffer is one more than the length of chars used
    const idx = data.chars.indexOf(key) + 1;
    audio[soundname][idx].currentTime = 0;
    audio[soundname][idx].play().catch(error => { });
}


async function update_character_stats() {
    character_stats_worker.postMessage({
        item_performance: data.item_performance,
        ngram_size: get_ngram_size()
    })
}


function get_current_layout() {
    return data.current_layout !== 'custom' ? data.current_layout : 'colemak';
}


function render_word() {
    var word = "";
    for (let i = 0; i < data.word.length; i++) {
        let sclass = "normalChar";
        if (i > data.word_index) {
            sclass = "normalChar";
        }
        else if (i == data.word_index) {
            sclass = "currentChar";
        }
        else if (data.word_errors[i]) {
            const errorClass = data.word_errors[i];
            sclass = typeof errorClass === 'string' ? errorClass : "errorChar";
        }
        else {
            sclass = "goodChar";
        }
        word += "<span class='" + sclass + "'>";
        if (data.word[i] == " ") {
            word += "&#9141;"
        }
        else if (data.word[i] == "&") {
            word += "&amp;"
        }
        else {
            word += data.word[i];
        }
        word += "</span>";
    }
    var keys_hit = "<span class='keys-hit'>";
    for (var d in data.keys_hit) {
        if (data.keys_hit[d] == ' ') {
            keys_hit += "&#9141;";
        }
        else if (data.keys_hit[d] == '&') {
            keys_hit += "&amp;";
        }
        else {
            keys_hit += data.keys_hit[d];
        }
    }
    for (var i = data.word_index; i < data.word.length; i++) {
        keys_hit += "&nbsp;";
    }
    keys_hit += "</span>";
    $("#word").html(word + "<br>" + keys_hit);
}


function find_word_containing_ngram(pattern) {
    let candidates = [];
    corpus.forEach(word => {
        if (word.indexOf(pattern) !== -1) {
            candidates.push(word);
        }
    });
    return _.sample(candidates);
}


function update_item_seen_status(item) {
    const seen = data.item_performance[item].seen;
    if (seen === 0) {
        document.getElementById("current-item-info").textContent = `picked word containing the ngram "${item}" which has never been seen before`;
    } else {
        document.getElementById("current-item-info").textContent = `picked word containing the ngram "${item}" which has been seen ${seen} times already`;
    }
}


function generate_word() {
    key_pressed_timestamp = null;
    const ngram = pick_next_item_mab();
    update_item_seen_status(ngram);
    const word = find_word_containing_ngram(ngram);
    return word;
}


function pick_next_item_mab() {
    const ngram_size = get_ngram_size();
    let rpe = [];
    for (const [key, params] of Object.entries(data.item_performance)) {
        if (key.length !== ngram_size) { continue; }
        if (!_.isNil(restricted_ngrams) && !(restricted_ngrams.has(key))) { continue; }
        const sample = jStat.beta.sample(params.alpha, params.beta);
        rpe.push([key, sample]);
    }
    const rpe_sorted = rpe.sort((a, b) => b[1] - a[1]);
    const item = rpe_sorted[0][0];
    return item;
}


$(document).ready(function () {
    confetti = new JSConfetti();
    reset_database();
    if ((localStorage.data != undefined)) {
        load();
    }
    $(document).keypress(keyHandler);
    $(document).keydown(keydownHandler);
    $(document).keyup(keyupHandler);
    initialize_ngram_db(corpus);
    next_word();
});
