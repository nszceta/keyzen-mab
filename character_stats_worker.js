/* For license information please see KEYZEN-LICENSE.txt */
importScripts('./vendor/jstat.min.js');
importScripts('./vendor/lodash.min.js');

const HISTOGRAM_LINE_HEIGHT_PIXELS = 18;
const HISTOGRAM_BINS = 15;


onmessage = (e) => {
    const ngram_size = e.data.ngram_size;
    let scores = {};
    Object.keys(e.data.item_performance).forEach(function (item) {
        if (item.length !== ngram_size) { return; }
        const params = e.data.item_performance[item];
        scores[item] = 1 - jStat.beta.mean(params.alpha, params.beta); // flip score around
    });
    const max_score = _.max(_.concat(_.values(scores)));
    const min_score = _.min(_.concat(_.values(scores)));

    let container = [];
    let bins = {};
    _.forEach(_.sortBy(_.toPairs(scores), 1), ([key, score]) => {
        let score_normed;
        if ((max_score - min_score) != 0) {
            score_normed = (score - min_score) / (max_score - min_score);
        } else {
            score_normed = 0;
        }
        const bin_idx = _.floor(score_normed / (1 / HISTOGRAM_BINS))
        bins[bin_idx] = _.union(bins[bin_idx], [key])
    });
    _.forEach(bins, (items, bin) => {
        _.forEach(items, (item, idx) => {
            const top = idx * HISTOGRAM_LINE_HEIGHT_PIXELS;
            const left = bin / HISTOGRAM_BINS * 100;
            const rounded_latency = _.round(scores[item] * 100)
            container.push({ top: top, left: left, item: item, rounded_latency: rounded_latency })
        });
    });

    postMessage(container);
}
