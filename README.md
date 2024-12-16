
# KeyZen MAB


## About

This project is a fork from [KeyZen Colemak-DH
](https://github.com/ranelpadon/keyzen-colemak-dh/), which itself was inspired by [KeyZen Colemak](http://first20hours.github.com/keyzen-colemak/), which was implemented by Josh Kaufman, and featured in his [**The First 20 Hours**](https://first20hours.com/) book (one of his personal challenges is to learn Colemak in 20 hours in which he succeeded). Kaufman's project is based on [KeyZen](https://github.com/wwwtyro/keyzen) which has numerous changes since he cloned it.

This fork focuses on aggressively identifying your weakest ngram performance and adjusting word recommendations based on the worst performing ones. This is accomplished by building a probability density function of each ngram and using dynamic thompson sampling to converge onto your worst performing ngrams as rapidly as possible.  

## Hosted Version
If you're online, you could access it here:
https://adamgradzki.com/keyzen-mab/


## Local Version/Installation
If you're offline, or GitHub Pages is not accessible, or want to modify some parts and run it locally, you could easily do that using a local web server. Here are samples using the mainstream Python/PHP utilities:


1. [Download the repo](https://github.com/nszceta/keyzen-mab/archive/master.zip) and unzip it in your local.

2. Go to the unzipped folder, and start the local server.
    - Python
        - Python 2
            - `python -m SimpleHTTPServer`
        - Python 3
            - `python3 -m http.server`
    - PHP
        - `php -S 0.0.0.0:8000`

3. Go to `http://0.0.0.0:8000` in your browser.
