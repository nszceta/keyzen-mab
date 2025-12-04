// The main entry point of the application, where we define constants and global variables.
// These constants and variables are used throughout the application to store and manage data.
// We define them here to make them easily accessible and to avoid polluting the global namespace.
var MAX_NGRAM_SIZE = 3; // Maximum size of character sequences to track
var DATA_CURRENT_VERSION = 3; // Database schema version
var LATENCY_LIMIT_MILLIS = 500; // Maximum typing latency to consider
var C = 20; // Constant for beta distribution parameter scaling

// Global state variables to store typing statistics, keyboard layouts, audio feedback, and more.
// These variables are used to keep track of the application's state and to update the UI accordingly.
var data; // Main data store for typing statistics
var layouts; // Keyboard layout configurations
var audio; // Audio feedback samples
var keyPresses; // Track currently pressed keys
var key_pressed_timestamp; // Timestamp of last keypress
var confetti; // Confetti effect instance
var character_stats_worker_message; // Messages from web worker
var restricted_ngrams; // Set of allowed ngrams (if restrictions active)
var ngram_buf_main = []; // Buffer for current word's ngrams
var corpus = []; // Current language corpus
var current_corpus_ngrams = new Set(); // Ngrams present in current corpus
// Get the corpus selector element
var corpus_selector = document.getElementById("corpus-selector");
// Get the corpus status element
var corpus_status_div = document.getElementById("corpus-status");

// Initialize Web Worker for character statistics calculation.
// This worker is used to perform computationally intensive tasks in the background,
// allowing the main thread to focus on updating the UI and handling user input.
const character_stats_worker = new Worker("character_stats_worker.js");
character_stats_worker.onmessage = (e) => {
  try {
    // Update the character stats worker message when a new message is received from the worker.
    // This message is used to update the UI with the latest character statistics.
    character_stats_worker_message = e.data;
  } catch (error) {
    // Log any errors that occur while processing the worker message.
    // This helps with debugging and ensures that the application remains stable.
    console.error("Error processing worker message:", error);
  }
};

// Function to download an object as a file.
// This function is used to save the typing statistics data to a file,
// allowing users to export and import their progress.
function download_object(content, fileName, contentType) {
  // Create a new link element to download the file.
  // This element is used to trigger the download process when clicked.
  const a = document.createElement("a");
  // Create a new blob to store the file contents.
  // This blob is used to represent the file data in a format that can be downloaded.
  const file = new Blob([JSON.stringify(content)], { type: contentType });
  // Set the link's href attribute to the blob's URL.
  // This sets the link's target to the blob, allowing the file to be downloaded.
  a.href = URL.createObjectURL(file);
  // Set the link's download attribute to the file name.
  // This sets the file name that will be used when the file is downloaded.
  a.download = fileName;
  // Simulate a click on the link to trigger the download.
  // This starts the download process and saves the file to the user's device.
  a.click();
  // Revoke the blob's URL to free up system resources.
  // This ensures that the blob is properly cleaned up after the download is complete.
  URL.revokeObjectURL(a.href);
}

// Function to load typing statistics data from a file.
// This function is used to import typing statistics data from a file,
// allowing users to restore their progress from a previous session.
function load_db_from_file(evt) {
  // Create a new file reader to read the file contents.
  // This reader is used to load the file data into memory.
  const reader = new FileReader();
  // Read the file contents as text.
  // This loads the file data into a string that can be parsed as JSON.
  reader.readAsText(evt.files[0]);
  // Handle the file load event.
  // This event is triggered when the file has been fully loaded into memory.
  reader.onload = function (evt) {
    // Parse the file contents as JSON.
    // This converts the file data into a JavaScript object that can be used by the application.
    data = JSON.parse(evt.target.result);
    // Update the character statistics and initialize the ngram database.
    // This ensures that the application is properly configured and ready for use.
    update_character_stats().then(() => {
      initialize_ngram_db(corpus);
      // Generate a new practice word.
      // This starts the typing practice session with a new word.
      next_word();
    });
  };
}

// Function to load ngram restrictions from a file.
// This function is used to import ngram restrictions from a file,
// allowing users to customize the typing practice session.
function load_ngrams_from_file(evt) {
  // Create a new file reader to read the file contents.
  // This reader is used to load the file data into memory.
  const reader = new FileReader();
  // Read the file contents as text.
  // This loads the file data into a string that can be parsed as a set of ngrams.
  reader.readAsText(evt.files[0]);
  // Handle the file load event.
  // This event is triggered when the file has been fully loaded into memory.
  reader.onload = function (evt) {
    // Parse the file contents as a set of ngrams.
    // This converts the file data into a set of ngrams that can be used to restrict the typing practice session.
    restricted_ngrams = new Set(evt.target.result.trim().split(" "));
    // Update the UI to reflect the loaded ngram restrictions.
    // This informs the user that the ngram restrictions have been successfully loaded.
    alert(`loaded ${restricted_ngrams.size} ngrams for restriction`);
    document.getElementById("load-ngrams-from-file-btn").textContent =
      `Loaded ngram restrictions on (${new Date().toString()})`;
    // Update the character statistics and initialize the ngram database.
    // This ensures that the application is properly configured and ready for use.
    update_character_stats().then();
    initialize_ngram_db(corpus);
    // Generate a new practice word.
    // This starts the typing practice session with a new word.
    next_word();
  };
}

// Function to render character statistics.
// This function is used to update the UI with the latest character statistics.
function render_character_stats() {
  // Check if the character statistics worker message is available.
  // This message is used to update the UI with the latest character statistics.
  if (_.isNil(character_stats_worker_message)) return;
  // Create a new progress container element.
  // This element is used to display the character statistics in a progress bar format.
  const pc = document.createElement("div");
  pc.setAttribute("id", "progress-container");
  // Iterate through the character statistics worker message.
  // This message contains the latest character statistics that need to be displayed.
  character_stats_worker_message.forEach((row) => {
    // Create a new progress item element.
    // This element is used to display a single character statistic in the progress bar.
    const pi = document.createElement("div");
    pi.setAttribute("class", "progress-item");
    // Set the progress item's top and left styles to position it correctly in the progress bar.
    pi.style.top = `${row.top}px`;
    pi.style.left = `${row.left}%`;
    // Set the progress item's text content to the character statistic.
    pi.textContent = row.item;
    // Create a new latency stats element.
    // This element is used to display the latency statistic for the character.
    const ls = document.createElement("div");
    ls.setAttribute("class", "latency-stats");
    // Set the latency stats element's text content to the latency statistic.
    ls.textContent = row.rounded_latency;
    // Append the latency stats element to the progress item element.
    pi.appendChild(ls);
    // Append the progress item element to the progress container element.
    pc.appendChild(pi);
  });
  // Replace the existing progress container element with the new one.
  // This updates the UI with the latest character statistics.
  document.getElementById("progress-container").replaceWith(pc);
  // Reset the character statistics worker message.
  // This ensures that the message is not processed again unnecessarily.
  character_stats_worker_message = null;
}

// Function to reset the database.
// This function is used to reset the typing statistics data and start a new session.
function reset_database_clicked() {
  // Reset the database.
  // This clears all typing statistics data and starts a new session.
  reset_database();
  // Save the updated database.
  // This ensures that the new session is properly saved.
  save();
  // Reload the page to apply the changes.
  // This ensures that the new session is properly initialized.
  window.location.replace("?time=" + Date.now()); // dummy cache busting parameter
}

// Function to reset the database.
// This function is used to clear all typing statistics data and start a new session.
function reset_database() {
  // Reset the database variables.
  // This clears all typing statistics data and starts a new session.
  data = {};
  layouts = {};
  audio = {};
  keyPresses = {};
  // Reset the key pressed timestamp.
  // This ensures that the latency measurement is properly reset.
  key_pressed_timestamp = null;
  // Initialize the database version.
  // This sets the database version to the current version.
  data.version = DATA_CURRENT_VERSION;
  // Initialize the item performance data.
  // This sets the item performance data to an empty object.
  data.item_performance = {};
  // Reset the ngram buffer.
  // This clears the ngram buffer to start a new session.
  ngram_buf_main = [];
  // Reset the corpus.
  // This clears the corpus to start a new session.
  corpus = [];
  // Initialize the ngram database.
  // This sets up the ngram database for the new session.
  initialize_ngram_db(corpus);
  // Load the audio feedback samples.
  // This loads the audio feedback samples for the new session.
  load_audio();
}

// Function to get the ngram size.
// This function is used to get the currently selected ngram size.
function get_ngram_size() {
  // Get the currently selected ngram size from the radio buttons.
  // This returns the value of the currently selected radio button.
  return +document.querySelector('input[name="ngram"]:checked').value;
}

// Function to convert a key code to a character.
// This function is used to convert a key code to a character.
function char_to_key(e) {
  // Convert the key code to a character using the fromCharCode method.
  // This returns the character represented by the key code.
  return String.fromCharCode(e.which);
}

// Function to handle key down events.
// This function is used to handle key down events and update the typing statistics accordingly.
function keydownHandler(e) {
  // Handle space bar
  if (e.key === " ") {
    e.preventDefault(); // Prevent spacebar from scrolling the page

    // Check if at the end of the word and the word is correct
    if (
      data.word_index >= data.word.length &&
      !Object.values(data.word_errors).includes(true)
    ) {
      // Generate a new word only if auto-advance is disabled
      if (!document.getElementById("auto-advance").checked) {
        next_word();
      }
    } else if (data.word_index < data.word.length) {
      // If not at the end of the word, handle as a regular key press
      keyHandler(e);
    }
    return;
  }

  // Check if the control key is pressed and the backspace key is pressed.
  // This checks if the user is trying to reset the typing statistics.
  // Support both Ctrl+Backspace (Windows/Linux) and Option/Alt+Backspace (macOS)
  if ((e.ctrlKey || e.altKey) && e.key === "Backspace") {
    // Prevent the default behavior of the backspace key.
    // This prevents the browser from navigating back when the backspace key is pressed.
    e.preventDefault();
    // Reset the ngram buffer and key pressed timestamp.
    // This clears the ngram buffer and resets the latency measurement.
    ngram_buf_main = [];
    key_pressed_timestamp = null;
    // Reset the word index and keys hit.
    // This clears the word index and keys hit to start a new session.
    data.word_index = 0;
    data.keys_hit = "";
    // Reset the word errors.
    // This clears the word errors to start a new session.
    data.word_errors = {};
    // Render the word.
    // This updates the UI with the new word.
    render_word();
    return;
  }
  // Check if the backspace key is pressed.
  // This checks if the user is trying to delete a character.
  if (e.key === "Backspace") {
    // Prevent the default behavior of the backspace key.
    // This prevents the browser from navigating back when the backspace key is pressed.
    e.preventDefault();
    // Reset the ngram buffer and key pressed timestamp.
    // This clears the ngram buffer and resets the latency measurement.
    ngram_buf_main = [];
    key_pressed_timestamp = null;
    // Play the correct audio sample.
    // This plays the correct audio sample when the backspace key is pressed.
    play_key_audio_sample("correct", "Backspace");
    // Check if the word index is greater than 0.
    // This checks if there are characters to delete.
    if (data.word_index > 0) {
      // Decrement the word index.
      // This moves the word index back by one character.
      data.word_index -= 1;
      // Remove the last character from the keys hit.
      // This removes the last character from the keys hit to reflect the deletion.
      data.keys_hit = data.keys_hit.slice(0, -1);
      // Render the word.
      // This updates the UI with the new word.
      render_word();
    }
    return;
  }
  // Check if the enter key is pressed or the space key is pressed and the word index is greater than or equal to the word length.
  // This checks if the user is trying to submit the word.
  else if (e.key === "Enter" || e.key === " ") {
    // Prevent the default behavior of the enter key or space key.
    // This prevents the browser from submitting the form when the enter key or space key is pressed.
    e.preventDefault();
    // Reset the ngram buffer.
    // This clears the ngram buffer to start a new session.
    ngram_buf_main = [];

    // Advance to the next correct word if there are no mistakes
    if (
      (data.word_index >= data.word.length &&
        !Object.values(data.word_errors).includes(true)) ||
      data.word_index === 0
    ) {
      // If at the end of the word and the word is correct, generate a new word
      next_word();
    }
    return;
  }
  // Check if the dead key is pressed.
  // This checks if the user is trying to press a dead key.
  if (e.key === "Dead") {
    // Prevent the default behavior of the dead key.
    // This prevents the browser from navigating back when the dead key is pressed.
    e.preventDefault();
    // Handle the key press.
    // This handles the key press and updates the typing statistics accordingly.
    keyHandler(e);
    // Set the key presses to false.
    // This sets the key presses to false to reflect the key release.
    keyPresses[e.code] = false;
    return;
  }
}

// Function to handle key up events.
// This function is used to handle key up events and update the typing statistics accordingly.
function keyupHandler(e) {
  // Set the key presses to false.
  // This sets the key presses to false to reflect the key release.
  keyPresses[e.code] = false;
}

// Function to calculate the item reward.
// This function is used to calculate the reward for a given item based on its latency and correctness.
function item_reward(latency, is_correct) {
  // Check if the item is incorrect.
  // This checks if the item is incorrect and returns a reward of 1 if it is.
  if (is_correct === 0) {
    return 1;
  }
  // Calculate the latency limited to the maximum latency limit.
  // This ensures that the latency is not greater than the maximum latency limit.
  const latency_limited = _.min([LATENCY_LIMIT_MILLIS, latency]);
  // Calculate the reward based on the latency limited.
  // This calculates the reward as the latency limited divided by the maximum latency limit.
  return latency_limited / LATENCY_LIMIT_MILLIS;
}

// Function to check if confetti is enabled.
// This function is used to check if confetti is enabled and return a boolean value accordingly.
function confetti_enabled() {
  // Get the confetti checkbox element.
  // This gets the confetti checkbox element to check its state.
  return document.getElementById("use-confetti").checked;
}

// Function to party.
// This function is used to trigger a party effect when a new item is seen.
function party() {
  // Check if the confetti instance is not null.
  // This checks if the confetti instance is not null before triggering the party effect.
  if (_.isNil(confetti)) {
    return;
  }
  // Add confetti to the party effect.
  // This adds confetti to the party effect to create a celebratory atmosphere.
  confetti.addConfetti();
}

// Function to update the score.
// This function is used to update the score for a given item based on its reward.
function update_score(item, reward) {
  // Check if the item has not been seen before and confetti is enabled.
  // This checks if the item has not been seen before and confetti is enabled to trigger a party effect.
  if (data.item_performance[item].seen === 0 && confetti_enabled()) {
    party();
  }
  // Get the item performance parameters.
  // This gets the item performance parameters to update the score.
  const params = data.item_performance[item];
  // Calculate the new alpha and beta parameters.
  // This calculates the new alpha and beta parameters based on the reward.
  let alpha_new = params.alpha + reward;
  let beta_new = params.beta + (1 - reward);
  // Check if the alpha and beta parameters are greater than or equal to the constant C.
  // This checks if the alpha and beta parameters are greater than or equal to the constant C to scale them down.
  if (params.alpha + params.beta >= C) {
    // Scale down the alpha and beta parameters.
    // This scales down the alpha and beta parameters to prevent them from growing too large.
    alpha_new *= C / (C + 1);
    beta_new *= C / (C + 1);
  }
  // Update the item performance parameters.
  // This updates the item performance parameters with the new alpha and beta values.
  data.item_performance[item].alpha = alpha_new;
  data.item_performance[item].beta = beta_new;
  // Increment the seen counter for the item.
  // This increments the seen counter for the item to reflect that it has been seen again.
  data.item_performance[item].seen += 1;
}

// Function to handle key presses.
// This function is used to handle key presses and update the typing statistics accordingly.
function keyHandler(e) {
  // Check if the data word is null or the key presses are not null or the word index is greater than or equal to the word length.
  // This checks if the data word is null or the key presses are not null or the word index is greater than or equal to the word length to prevent handling the key press.
  if (
    _.isNil(data.word) ||
    keyPresses[e.code] ||
    data.word_index >= data.word.length
  )
    return;
  // Set the key presses to true.
  // This sets the key presses to true to reflect the key press.
  keyPresses[e.code] = true;
  // Get the key character.
  // This gets the key character to update the typing statistics.
  var key = char_to_key(e);
  // Append the key character to the keys hit.
  // This appends the key character to the keys hit to reflect the key press.
  data.keys_hit += key;
  // Get the desired letter.
  // This gets the desired letter to compare with the key character.
  const desired_letter = data.word[data.word_index];
  // Initialize a flag to indicate if the key press is correct.
  // This initializes a flag to indicate if the key press is correct.
  let is_correct = false;
  // Check if the key character is equal to the desired letter.
  // This checks if the key character is equal to the desired letter to determine if the key press is correct.
  if (key == desired_letter) {
    // Check if the word errors at the current index is not null.
    // This checks if the word errors at the current index is not null to update the word errors.
    if (data.word_errors[data.word_index]) {
      // Update the word errors at the current index to corrected char.
      // This updates the word errors at the current index to corrected char to reflect the correction.
      data.word_errors[data.word_index] = "correctedChar";
    }
    // Play the correct audio sample.
    // This plays the correct audio sample when the key press is correct.
    play_key_audio_sample("correct", key);
    // Set the is correct flag to true.
    // This sets the is correct flag to true to reflect the correct key press.
    is_correct = true;
  }
  // Check if the key character is not equal to the desired letter.
  // This checks if the key character is not equal to the desired letter to determine if the key press is incorrect.
  else {
    // Play the mistake audio sample.
    // This plays the mistake audio sample when the key press is incorrect.
    play_key_audio_sample("mistake", key);
    // Update the word errors at the current index to true.
    // This updates the word errors at the current index to true to reflect the error.
    data.word_errors[data.word_index] = true;
  }
  // Append the desired letter to the ngram buffer.
  // This appends the desired letter to the ngram buffer to reflect the key press.
  ngram_buf_main.push(desired_letter);
  // Check if the key pressed timestamp is not null.
  // This checks if the key pressed timestamp is not null to calculate the latency.
  if (key_pressed_timestamp !== null) {
    // Calculate the latency.
    // This calculates the latency by subtracting the key pressed timestamp from the current time.
    const latency = Date.now() - key_pressed_timestamp;
    // Update the key pressed timestamp.
    // This updates the key pressed timestamp to reflect the current time.
    key_pressed_timestamp = Date.now();
    // Calculate the reward.
    // This calculates the reward based on the latency and correctness of the key press.
    const reward = item_reward(latency, is_correct);
    // Iterate through the ngram sizes.
    // This iterates through the ngram sizes to update the score for each ngram.
    for (let size = 1; size <= MAX_NGRAM_SIZE; size++) {
      // Check if the ngram buffer length is greater than or equal to the ngram size.
      // This checks if the ngram buffer length is greater than or equal to the ngram size to update the score for the ngram.
      if (ngram_buf_main.length >= size) {
        // Get the ngram.
        // This gets the ngram by slicing the ngram buffer to the desired size.
        const ngram = ngram_buf_main.slice(-size).join("");
        // Update the score for the ngram.
        // This updates the score for the ngram based on the reward.
        update_score(ngram, reward);
      }
    }
  } else {
    // Update the key pressed timestamp.
    // This updates the key pressed timestamp to reflect the current time.
    key_pressed_timestamp = Date.now();
  }
  // Increment the word index.
  // This increments the word index to reflect the key press.
  data.word_index += 1;
  // Check if the word index is greater than or equal to the word length and there are no word errors.
  // This checks if the word index is greater than or equal to the word length and there are no word errors to generate a new word.
  if (
    data.word_index >= data.word.length &&
    !Object.values(data.word_errors).includes(true) &&
    document.getElementById("auto-advance").checked
  ) {
    // Play the next word audio sample.
    // This plays the next word audio sample when the word is completed correctly.
    play_next_word_audio_sample();
    // Generate a new word.
    // This generates a new word to start a new typing practice session.
    next_word();
  }
  // Render the word.
  // This renders the word to update the UI with the new word.
  render_word();
}

// Function to generate the next word.
// This function is used to generate the next word for typing practice.
function next_word() {
  // Check if there are typos in the text.
  // This checks if there are typos in the text to prevent generating a new word.
  if (
    !_.isNil(data.word_errors) &&
    Object.values(data.word_errors).includes(true)
  ) {
    return;
  }

  // Initialize a maximum number of retries.
  // This initializes a maximum number of retries to prevent infinite loops.
  const MAX_RETRIES = 3;
  // Initialize a counter for the number of retries.
  // This initializes a counter for the number of retries to track the number of attempts.
  let attempts = 0;
  // Initialize a variable to store the new word.
  // This initializes a variable to store the new word.
  let new_word;
  // Loop until a new word is generated or the maximum number of retries is reached.
  // This loop generates a new word and checks if it is valid.
  while (!new_word && attempts < MAX_RETRIES) {
    // Generate a new word.
    // This generates a new word using the generate word function.
    new_word = generate_word();
    // Increment the attempts counter.
    // This increments the attempts counter to track the number of attempts.
    attempts++;
  }
  // Check if a new word was not generated after the maximum number of retries.
  // This checks if a new word was not generated after the maximum number of retries to handle the error.
  if (!new_word) {
    // Check if the corpus is empty.
    // This checks if the corpus is empty to handle the error.
    if (_.isEmpty(corpus)) {
      // Log an error message.
      // This logs an error message to indicate that the corpus is empty.
      console.log("Failed to generate word because corpus is empty.");
      return;
    }
    // Log an error message.
    // This logs an error message to indicate that a new word could not be generated after the maximum number of retries.
    console.error(
      "Failed to generate valid word after",
      MAX_RETRIES,
      "attempts",
    );
    return;
  }
  // Update the data word.
  // This updates the data word with the new word.
  data.word = new_word;
  // Reset the word index.
  // This resets the word index to start a new typing practice session.
  data.word_index = 0;
  // Reset the keys hit.
  // This resets the keys hit to start a new typing practice session.
  data.keys_hit = "";
  // Reset the word errors.
  // This resets the word errors to start a new typing practice session.
  data.word_errors = {};
  // Reset the ngram buffer.
  // This resets the ngram buffer to start a new typing practice session.
  ngram_buf_main = [];
  // Update the character statistics.
  // This updates the character statistics to reflect the new word.
  update_character_stats().then();
  // Render the character statistics.
  // This renders the character statistics to update the UI.
  render_character_stats();
  // Render the word.
  // This renders the word to update the UI with the new word.
  render_word();
  // Save the data.
  // This saves the data to persist the typing statistics.
  save();
  // Play the next word sound sample
  play_next_word_audio_sample();
}

// Function to save the data.
// This function is used to save the typing statistics data to local storage.
function save() {
  // Check if there's a last_corpus in localStorage that should be preserved
  let preserved_last_corpus = null;
  try {
    const existing_data = JSON.parse(localStorage.data || "{}");
    if (existing_data.last_corpus && !data.last_corpus) {
      preserved_last_corpus = existing_data.last_corpus;
      data.last_corpus = preserved_last_corpus;
    }
  } catch (e) {
    // Ignore errors reading existing data
  }

  // Save the data to local storage.
  // This saves the data to local storage to persist the typing statistics.
  localStorage.data = JSON.stringify(data);
}

// Function to load the data.
// This function is used to load the typing statistics data from local storage.
function load() {
  // Try to load the data from local storage.
  // This tries to load the data from local storage to restore the typing statistics.
  try {
    // Get the data from local storage.
    // This gets the data from local storage to restore the typing statistics.
    const data_temp = JSON.parse(localStorage.data);
    if (
      data_temp &&
      data_temp.hasOwnProperty("version") &&
      data_temp.version === DATA_CURRENT_VERSION &&
      data_temp.item_performance
    ) {
      // Update the data with the loaded data.
      // This updates the data with the loaded data to restore the typing statistics.
      data = data_temp;
    } else {
      // Log a warning message.
      // This logs a warning message to indicate that the data is invalid or incomplete.
      console.warn("Invalid or incomplete data in localStorage");
      // Reset the database.
      // This resets the database to start a new typing practice session.
      reset_database();
    }
  } catch (error) {
    // Log an error message.
    // This logs an error message to indicate that an error occurred while loading the data.
    console.error("Error loading data:", error);
    // Reset the database.
    // This resets the database to start a new typing practice session.
    reset_database();
  }
}

// Function to play the next word audio sample.
// This function is used to play the next word audio sample when a word is completed correctly.
function play_next_word_audio_sample() {
  // Play the next word audio sample.
  // This plays the next word audio sample to provide feedback to the user.
  audio.next_word.currentTime = 0;
  audio.next_word.play().catch((_) => {});
}

// Function to load the audio feedback samples.
// This function is used to load the audio feedback samples to provide feedback to the user.
function load_audio() {
  // Initialize the audio feedback samples.
  // This initializes the audio feedback samples to provide feedback to the user.
  audio.correct = new Map();
  audio.mistake = new Map();
  // Load the next word audio sample.
  // This loads the next word audio sample to provide feedback to the user.
  audio.next_word = new Audio("vendor/poker_card_flick.mp3");
}

// Function to play a key audio sample.
// This function is used to play a key audio sample to provide feedback to the user.
function play_key_audio_sample(soundname, key) {
  // Try to play the key audio sample.
  // This tries to play the key audio sample to provide feedback to the user.
  try {
    // Check if the audio feedback sample is not already loaded.
    // This checks if the audio feedback sample is not already loaded to load it if necessary.
    if (!audio[soundname].has(key)) {
      // Load the audio feedback sample.
      // This loads the audio feedback sample to provide feedback to the user.
      audio[soundname].set(
        key,
        new Audio(
          soundname === "correct" ? "vendor/click.mp3" : "vendor/clack.mp3",
        ),
      );
    }
    // Get the audio feedback sample.
    // This gets the audio feedback sample to play it.
    const sound = audio[soundname].get(key);
    // Play the audio feedback sample.
    // This plays the audio feedback sample to provide feedback to the user.
    sound.currentTime = 0;
    sound.play().catch((_) => {});
  } catch (error) {
    // Log a warning message.
    // This logs a warning message to indicate that an error occurred while playing the audio feedback sample.
    console.warn("Error playing audio:", error);
  }
}

// Function to update the character statistics.
// This function is used to update the character statistics to reflect the user's typing practice.
async function update_character_stats() {
  // Return a promise to update the character statistics.
  // This returns a promise to update the character statistics to allow for asynchronous processing.
  return new Promise((resolve) => {
    // Update the character statistics worker message.
    // This updates the character statistics worker message to reflect the new character statistics.
    character_stats_worker.onmessage = (e) => {
      character_stats_worker_message = e.data;
      // Resolve the promise.
      // This resolves the promise to indicate that the character statistics have been updated.
      resolve();
    };
    // Post a message to the character statistics worker.
    // This posts a message to the character statistics worker to update the character statistics.
    character_stats_worker.postMessage({
      item_performance: data.item_performance,
      ngram_size: get_ngram_size(),
    });
  });
}

// Function to render the word.
// This function is used to render the word to update the UI with the current word.
function render_word() {
  // Check if the data word is null.
  // This checks if the data word is null to prevent rendering the word.
  if (_.isNil(data.word)) {
    return;
  }
  // Initialize a variable to store the word HTML.
  // This initializes a variable to store the word HTML to render the word.
  var word = "";
  // Iterate through the word characters.
  // This iterates through the word characters to render the word.
  for (let i = 0; i < data.word.length; i++) {
    // Initialize a variable to store the character class.
    // This initializes a variable to store the character class to render the character.
    let sclass = "normalChar";
    // Check if the character index is greater than the word index.
    // This checks if the character index is greater than the word index to render the character as normal.
    if (i > data.word_index) {
      sclass = "normalChar";
    }
    // Check if the character index is equal to the word index.
    // This checks if the character index is equal to the word index to render the character as current.
    else if (i == data.word_index) {
      sclass = "currentChar";
    }
    // Check if the word errors at the character index is not null.
    // This checks if the word errors at the character index is not null to render the character as an error.
    else if (data.word_errors[i]) {
      // Get the error class.
      // This gets the error class to render the character as an error.
      const errorClass = data.word_errors[i];
      // Update the character class.
      // This updates the character class to render the character as an error.
      sclass = typeof errorClass === "string" ? errorClass : "errorChar";
    }
    // Check if the character index is less than the word index and the word errors at the character index is null.
    // This checks if the character index is less than the word index and the word errors at the character index is null to render the character as good.
    else {
      sclass = "goodChar";
    }
    // Append the character HTML to the word HTML.
    // This appends the character HTML to the word HTML to render the word.
    word += "<span class='" + sclass + "'>";
    // Check if the character is a space.
    // This checks if the character is a space to render it as a non-breaking space.
    if (data.word[i] == " ") {
      word += "&#9141;";
    }
    // Check if the character is an ampersand.
    // This checks if the character is an ampersand to render it as an HTML entity.
    else if (data.word[i] == "&") {
      word += "&amp;";
    }
    // Render the character as text.
    // This renders the character as text to display it in the UI.
    else {
      word += data.word[i];
    }
    // Close the span element.
    // This closes the span element to complete the character HTML.
    word += "</span>";
  }
  // Initialize a variable to store the keys hit HTML.
  // This initializes a variable to store the keys hit HTML to render the keys hit.
  var keys_hit = "<span class='keys-hit'>";
  // Iterate through the keys hit.
  // This iterates through the keys hit to render the keys hit.
  for (var d in data.keys_hit) {
    // Check if the key is a space.
    // This checks if the key is a space to render it as a non-breaking space.
    if (data.keys_hit[d] == " ") {
      keys_hit += "&#9141;";
    }
    // Check if the key is an ampersand.
    // This checks if the key is an ampersand to render it as an HTML entity.
    else if (data.keys_hit[d] == "&") {
      keys_hit += "&amp;";
    }
    // Render the key as text.
    // This renders the key as text to display it in the UI.
    else {
      keys_hit += data.keys_hit[d];
    }
  }
  // Iterate through the remaining characters.
  // This iterates through the remaining characters to render the remaining characters as non-breaking spaces.
  for (var i = data.word_index; i < data.word.length; i++) {
    keys_hit += "&nbsp;";
  }
  // Close the span element.
  // This closes the span element to complete the keys hit HTML.
  keys_hit += "</span>";
  // Update the word HTML element.
  // This updates the word HTML element to render the word and keys hit.
  $("#word").html(word + "<br>" + keys_hit);
}

// Function to find a word containing a given ngram.
// This function is used to find a word containing a given ngram to generate a new word for typing practice.
function find_word_containing_ngram(pattern) {
  // Initialize a variable to store the candidate words.
  // This initializes a variable to store the candidate words to find a word containing the given ngram.
  let candidates = [];
  // Iterate through the corpus words.
  // This iterates through the corpus words to find a word containing the given ngram.
  corpus.forEach((word) => {
    // Check if the word contains the given ngram.
    // This checks if the word contains the given ngram to add it to the candidate words.
    if (word.indexOf(pattern) !== -1) {
      candidates.push(word);
    }
  });
  // Return a random candidate word.
  // This returns a random candidate word to generate a new word for typing practice.
  return _.sample(candidates);
}
// Function to update the item seen status.
// This function is used to update the item seen status to reflect the number of times an item has been seen.
function update_item_seen_status(item) {
  // Get the seen counter for the item.
  // This gets the seen counter for the item to update the item seen status.
  const seen = data.item_performance[item].seen;
  // Check if the item has not been seen before.
  // This checks if the item has not been seen before to update the item seen status.
  if (seen === 0) {
    // Update the current item info element.
    // This updates the current item info element to reflect that the item has not been seen before.
    document.getElementById("current-item-info").textContent =
      `picked word containing the ngram "${item}" which has never been seen before`;
  } else {
    // Update the current item info element.
    // This updates the current item info element to reflect the number of times the item has been seen.
    document.getElementById("current-item-info").textContent =
      `picked word containing the ngram "${item}" which has been seen ${seen} times already`;
  }
}

// Function to generate a new word for typing practice.
// This function is used to generate a new word for typing practice by selecting a random ngram and finding a word that contains it.
function generate_word() {
  // Reset the key pressed timestamp.
  // This resets the key pressed timestamp to start a new typing practice session.
  key_pressed_timestamp = null;
  // Initialize a set to store the tried ngrams.
  // This initializes a set to store the tried ngrams to prevent infinite loops.
  const tried_ngrams = new Set();
  // Loop until a new word is generated or all possible ngrams have been tried.
  // This loop generates a new word by selecting a random ngram and finding a word that contains it.
  while (true) {
    // Get the next ngram using the multi-armed bandit selection.
    // This gets the next ngram using the multi-armed bandit selection to prioritize ngrams that need more practice.
    const ngram = pick_next_item_mab();
    // Check if no ngram could be selected.
    // This checks if no ngram could be selected to exit the loop and prevent infinite loops.
    if (_.isNil(ngram)) {
      return;
    }
    // Check if the ngram has already been tried.
    // This checks if the ngram has already been tried to prevent infinite loops.
    if (tried_ngrams.has(ngram)) {
      // Check if all possible ngrams have been tried.
      // This checks if all possible ngrams have been tried to exit the loop and prevent infinite loops.
      if (tried_ngrams.size >= Object.keys(data.item_performance).length) {
        // Log an error message.
        // This logs an error message to indicate that no valid words could be found for any available ngrams in the corpus.
        console.warn(
          "No valid words found for any available ngrams in the corpus",
        );
        return;
      }
      // Continue to the next iteration.
      // This continues to the next iteration to try another ngram.
      continue;
    }
    // Add the ngram to the tried ngrams set.
    // This adds the ngram to the tried ngrams set to prevent infinite loops.
    tried_ngrams.add(ngram);
    // Find a word that contains the ngram.
    // This finds a word that contains the ngram to generate a new word for typing practice.
    const word = find_word_containing_ngram(ngram);
    // Check if no word contains the ngram.
    // This checks if no word contains the ngram to log an error message and continue to the next iteration.
    if (!word) {
      // Log an error message.
      // This logs an error message to indicate that no word could be found containing the ngram.
      console.warn(
        `No word found containing ngram: ${ngram}, trying another ngram...`,
      );
      continue;
    }
    // Update the item seen status.
    // This updates the item seen status to reflect the number of times the item has been seen.
    update_item_seen_status(ngram);
    // Return the word.
    // This returns the word to generate a new word for typing practice.
    return word;
  }
}

function pick_next_item_mab() {
  // Check if the corpus is empty or the item performance data is not available.
  if (corpus.length < 1 || !data.item_performance) {
    return;
  }

  // Get the currently selected ngram size.
  const ngram_size = get_ngram_size();

  // Initialize an array to store the random priority estimates.
  let rpe = [];

  // Iterate through the item performance data.
  for (const [key, params] of Object.entries(data.item_performance)) {
    // Check if the ngram size does not match the currently selected size or the ngram is not in the current corpus.
    if (key.length !== ngram_size) {
      continue;
    }
    if (!current_corpus_ngrams.has(key)) {
      continue;
    }
    // Check if the ngram is not in the restricted set (if restrictions are active).
    if (!_.isNil(restricted_ngrams) && !restricted_ngrams.has(key)) {
      continue;
    }

    // Sample from a beta distribution to determine the priority estimate.
    const sample = jStat.beta.sample(params.alpha, params.beta);

    // Add the ngram and its priority estimate to the array.
    rpe.push([key, sample]);
  }

  // Check if no ngrams are available.
  if (rpe.length === 0) {
    return;
  }

  // Sort the ngrams by their priority estimates in descending order.
  const rpe_sorted = rpe.sort((a, b) => b[1] - a[1]);

  // Return the ngram with the highest priority estimate.
  const item = rpe_sorted[0][0];
  return item;
}

// Function to initialize the ngram database.
// This function is used to initialize the ngram database to store the ngrams and their frequencies.
function initialize_ngram_db(corpus) {
  // Clear the set of current corpus ngrams before rebuilding it.
  // This ensures that we don't have stale ngrams when switching corpora.
  current_corpus_ngrams.clear();
  // Iterate through all possible ngram sizes (1 to MAX_NGRAM_SIZE).
  // This iterates through all possible ngram sizes to initialize the ngram database.
  for (const ngram_size_minus_1 of Array(MAX_NGRAM_SIZE).keys()) {
    // Process each word in the corpus.
    // This processes each word in the corpus to initialize the ngram database.
    corpus.forEach((word) => {
      // Generate all possible ngrams of the current size for this word.
      // This generates all possible ngrams of the current size for this word to initialize the ngram database.
      word_to_ngrams(word, ngram_size_minus_1 + 1).forEach((ngram) => {
        // Add this ngram to the set of ngrams present in current corpus.
        // This adds this ngram to the set of ngrams present in current corpus to initialize the ngram database.
        current_corpus_ngrams.add(ngram);
        // If this ngram doesn't exist in our historical performance data,
        // initialize it with default values.
        // This initializes the ngram with default values if it doesn't exist in our historical performance data.
        if (!(ngram in data.item_performance)) {
          data.item_performance[ngram] = {
            alpha: 1, // Initial alpha parameter for beta distribution
            beta: 1, // Initial beta parameter for beta distribution
            seen: 0, // Counter for how many times this ngram has been practiced
          };
        }
      });
    });
  }
}

// Function to convert a word to ngrams.
// This function is used to convert a word to ngrams to initialize the ngram database.
function word_to_ngrams(word, ngram_size) {
  // Initialize an array to store the ngrams.
  // This initializes an array to store the ngrams to convert the word to ngrams.
  let ngrams_buf = [];
  // Initialize an array to store the current ngram.
  // This initializes an array to store the current ngram to convert the word to ngrams.
  let ngram_buf = [];
  // Iterate through the word characters.
  // This iterates through the word characters to convert the word to ngrams.
  for (let i = 0; i < word.length; i++) {
    // Add the character to the current ngram.
    // This adds the character to the current ngram to convert the word to ngrams.
    ngram_buf.push(word[i]);
    // Check if the current ngram size is equal to the ngram size.
    // This checks if the current ngram size is equal to the ngram size to add the ngram to the ngrams array.
    if (ngram_buf.length == ngram_size) {
      // Add the ngram to the ngrams array.
      // This adds the ngram to the ngrams array to convert the word to ngrams.
      ngrams_buf.push(ngram_buf.join(""));
    } else if (ngram_buf.length >= ngram_size) {
      // Update the current ngram by removing the first character.
      // This updates the current ngram by removing the first character to convert the word to ngrams.
      ngram_buf = ngram_buf.slice(1, ngram_size + 1);
      // Add the ngram to the ngrams array.
      // This adds the ngram to the ngrams array to convert the word to ngrams.
      ngrams_buf.push(ngram_buf.join(""));
    }
  }
  // Return the ngrams array.
  // This returns the ngrams array to convert the word to ngrams.
  return ngrams_buf;
}

// Function to fetch the corpus list from the MonkeyType repository.
// This function is used to fetch the corpus list from the MonkeyType repository to populate the corpus selector.
async function fetchCorpusList() {
  try {
    // Fetch all language files from MonkeyType
    const response = await fetch("https://api.github.com/repos/monkeytypegame/monkeytype/contents/frontend/static/languages?ref=master");
    const files = await response.json();

    // Get only JSON files (language files)
    const languageFiles = files.filter(file => file.name.endsWith('.json'));

    // Group languages by their base name (e.g., english, english_1k, english_10k -> english)
    const languageGroups = {};
    const baseNames = new Set();

    // First pass: extract base names without downloading any files
    for (const file of languageFiles) {
      const langName = file.name.replace('.json', '');

      // Extract base name (remove suffixes like _1k, _10k, etc.)
      let baseName = langName;
      const match = langName.match(/^(.+?)(?:_\d+k|_\d+)?$/);
      if (match) {
        baseName = match[1];
      }

      baseNames.add(baseName);
    }

    // Create groups intelligently based on naming patterns
    // Only download files when we can't determine the group from the name
    const baseNameArray = Array.from(baseNames);

    // Initialize common groups
    languageGroups['Code'] = { name: 'Code', languages: [] };
    languageGroups['English'] = { name: 'English', languages: [] };

    // Second pass: categorize each language file
    for (const file of languageFiles) {
      const langName = file.name.replace('.json', '');

      // Extract base name
      let baseName = langName;
      const match = langName.match(/^(.+?)(?:_\d+k|_\d+)?$/);
      if (match) {
        baseName = match[1];
      }

      // Categorize based on patterns without downloading files
      if (baseName.startsWith('code_')) {
        languageGroups['Code'].languages.push(langName);
      } else if (baseName === 'english') {
        languageGroups['English'].languages.push(langName);
      } else if (!languageGroups[baseName]) {
        // For unknown languages, create a group with formatted name
        // Only download if it's the first occurrence of this language type
        const groupName = baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/_/g, ' ');
        languageGroups[baseName] = {
          name: groupName,
          languages: [langName]
        };
      } else {
        languageGroups[baseName].languages.push(langName);
      }
    }

    // Convert to array format
    const groupedLanguages = Object.values(languageGroups);

    // Sort languages within each group
    groupedLanguages.forEach(group => {
      group.languages.sort();
    });

    // Sort groups alphabetically, but put English and Code first
    groupedLanguages.sort((a, b) => {
      if (a.name === 'English') return -1;
      if (b.name === 'English') return 1;
      if (a.name === 'Code') return -1;
      if (b.name === 'Code') return 1;
      return a.name.localeCompare(b.name);
    });

    // Populate the corpus selector with the grouped languages
    const corpus_selector = document.getElementById("corpus-selector");

    // Clear existing options
    corpus_selector.innerHTML = "";

    // Add a default "Select a corpus" option to the corpus selector.
    // This option will be disabled and selected by default, prompting the user to select a corpus.
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.text = "Select a corpus";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    corpus_selector.appendChild(defaultOption);

    // Iterate through the grouped languages and add each language to the corpus selector.
    // This adds each language to the corpus selector to allow the user to select a corpus.
    groupedLanguages.forEach((group) => {
      // Create an option group element for the language group.
      // This creates an option group element for the language group to group related languages together.
      const optionGroup = document.createElement("optgroup");
      optionGroup.label = group.name;

      // Iterate through the languages in the group and add each language to the option group.
      // This adds each language to the option group to allow the user to select a language from the group.
      group.languages.forEach((language) => {
        // Create an option element for the language.
        // This creates an option element for the language to add to the option group.
        const option = document.createElement("option");
        option.value = language;
        option.text = language
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        // Add the option element to the option group.
        // This adds the option element to the option group to add the language to the corpus selector.
        optionGroup.appendChild(option);
      });

      // Add the option group to the corpus selector.
      // This adds the option group to the corpus selector to add the language group to the corpus selector.
      corpus_selector.appendChild(optionGroup);
    });

    // Add an event listener to the corpus selector element.
    // This event listener listens for changes to the selected corpus and updates the corpus variable.
    corpus_selector.addEventListener("change", function () {
      const corpus_name = corpus_selector.value;
      // Check if the selected corpus is not undefined and not the default option.
      // This checks if the selected corpus is not undefined and not the default option to load it.
      if (corpus_name && corpus_name !== "") {
        // Update the data object with the selected corpus immediately
        // This ensures the selection is saved even before the corpus is fetched
        data.last_corpus = corpus_name;
        // Load the selected corpus.
        // This loads the selected corpus to update the typing practice session.
        fetchCorpus(corpus_name);
      }
    });
  } catch (error) {
    console.error("Error fetching corpus list:", error);
    // Fallback: display error message to user
    const corpus_selector = document.getElementById("corpus-selector");
    corpus_selector.innerHTML = '<option value="">Error loading languages</option>';
  }
}

// Function to fetch a corpus from the MonkeyType repository.
// This function is used to fetch a corpus from the MonkeyType repository to load it for typing practice.
function fetchCorpus(corpus_name) {
  // Get the corpus status element.
  // This gets the corpus status element to display the status of the corpus loading process.
  const corpus_status_div = document.getElementById("corpus-status");
  // Update the corpus status element.
  // This updates the corpus status element to reflect the loading state.
  corpus_status_div.innerText = "Loading...";
  // Fetch the corpus from the MonkeyType repository.
  // This fetches the corpus from the MonkeyType repository to load it for typing practice.
  fetch(
    `https://raw.githubusercontent.com/monkeytypegame/monkeytype/refs/heads/master/frontend/static/languages/${corpus_name}.json`,
  )
    .then((response) => response.json())
    .then((data) => {
      // Update the corpus.
      // This updates the corpus to reflect the new data.
      corpus = data.words;
      // Save the last used corpus to the data object
      // This saves the last used corpus to remember it for future sessions
      data.last_corpus = corpus_name;
      // Update local storage with the new data
      localStorage.data = JSON.stringify(data);
      // Update the corpus status element.
      // This updates the corpus status element to reflect the success state.
      corpus_status_div.innerText = `${corpus_name} loaded (${corpus.length} words)`;
      corpus_status_div.classList.remove("error");
      // Initialize the ngram database.
      // This initializes the ngram database to store the ngrams and their frequencies.
      initialize_ngram_db(corpus);
      // Generate a new word for typing practice.
      // This generates a new word for typing practice to start a new session.
      next_word();
      // Lose focus of the select dropdown.
      // This loses focus of the select dropdown to prevent accidental corpus changes.
      document.getElementById("corpus-selector").blur();
    })
    .catch((error) => {
      // Update the corpus status element.
      // This updates the corpus status element to reflect the error state.
      corpus_status_div.innerText = `Error loading ${corpus_name}: ${error.message}`;
      corpus_status_div.classList.add("error");
    });
}

// Set up the event listeners for the ngram size radio buttons.
// This sets up the event listeners for the ngram size radio buttons to update the typing practice session when the ngram size is changed.
document.querySelectorAll('input[name="ngram"]').forEach((radio) => {
  radio.addEventListener("change", async () => {
    try {
      // Update the character statistics.
      // This updates the character statistics to reflect the new ngram size.
      await update_character_stats();
      // Render the character statistics.
      // This renders the character statistics to update the UI.
      render_character_stats();
      // Generate a new word for typing practice.
      // This generates a new word for typing practice to start a new session.
      next_word();
    } catch (error) {
      // Log an error message.
      // This logs an error message to indicate that an error occurred while updating the character statistics.
      console.error("Error handling ngram change:", error);
    }
  });
});

// Initialize the application.
// This initializes the application by setting up the event listeners and loading the data.
$(document).ready(async function () {
  // Initialize the confetti instance.
  // This initializes the confetti instance to provide a celebratory effect when a new item is seen.
  confetti = new JSConfetti();
  // Reset the database.
  // This resets the database to start a new typing practice session.
  reset_database();
  // Check if data is available in local storage.
  // This checks if data is available in local storage to load it and restore the typing statistics.
  if (localStorage.data != undefined) {
    // Load the data from local storage.
    // This loads the data from local storage to restore the typing statistics.
    load();
  }
  // Set up the event listeners for key presses.
  // This sets up the event listeners for key presses to handle user input and update the typing statistics.
  $(document).keypress(keyHandler);
  $(document).keydown(keydownHandler);
  $(document).keyup(keyupHandler);

  // Fetch the corpus list first
  try {
    await fetchCorpusList();

    // Wait a tick for the DOM to update
    await new Promise(resolve => setTimeout(resolve, 0));

    const corpus_selector = document.getElementById("corpus-selector");
    let corpusFound = false;

    // Check if there's a last used corpus in the data
    if (data.last_corpus) {
      // Traverse all options in the select (including those in optgroups)
      const options = corpus_selector.querySelectorAll('option');

      for (const option of options) {
        if (option.value === data.last_corpus && !option.disabled) {
          // Found the saved corpus, select it
          console.log("Found matching option, setting value to:", data.last_corpus);
          corpus_selector.value = data.last_corpus;
          corpusFound = true;

          // Debug: log the selector state after setting
          console.log("Selector value after setting:", corpus_selector.value);
          console.log("Selected index:", corpus_selector.selectedIndex);
          console.log("Selected option text:", corpus_selector.options[corpus_selector.selectedIndex]?.text);

          // Check if corpus is already loaded (has words)
          if (corpus.length > 0) {
            // Corpus already loaded, just update UI
            console.log("Corpus already has words, initializing...");
            const corpus_status_div = document.getElementById("corpus-status");
            corpus_status_div.innerText = `${data.last_corpus} loaded (${corpus.length} words)`;
            corpus_status_div.classList.remove("error");
            initialize_ngram_db(corpus);
            next_word();
          } else {
            // Corpus not loaded, fetch it
            console.log("Corpus empty, fetching...");
            fetchCorpus(data.last_corpus);
          }
          break;
        }
      }

      if (!corpusFound && data.last_corpus) {
        console.log("Did not find saved corpus in options!");
      }
    }

    // If no saved corpus found or corpus not available, load the first available corpus
    if (!corpusFound) {
      const options = corpus_selector.querySelectorAll('option:not(:disabled)');
      if (options.length > 0) {
        // Skip the first "Select a corpus" option if it exists
        const firstRealOption = options[0].value === "" ? options[1] : options[0];
        if (firstRealOption && firstRealOption.value) {
          // Select the option and set the selector value
          firstRealOption.selected = true;
          corpus_selector.value = firstRealOption.value;
          fetchCorpus(firstRealOption.value);
        }
      }
    }
  } catch (error) {
    console.error("Error initializing:", error);
    // If corpus list fails to load, still initialize with default corpus
    const corpus_status_div = document.getElementById("corpus-status");
    corpus_status_div.innerText = "Error loading language list";
    corpus_status_div.classList.add("error");
  }
});
