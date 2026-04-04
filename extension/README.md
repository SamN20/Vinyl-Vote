# Vinyl Vote Companion extension

This directory contains the Chrome/Edge/Firefox (MV3-compatible) extension that accompanies the Vinyl Vote web app. When you visit Spotify, Apple Music or YouTube, the extension checks whether you have submitted votes for the current album and opens an overlay reminder if you have not.

## Features

- Pulls the active album, countdown timer and any saved scores from the new `/api` endpoints.
- Stores in-progress votes locally and lets you submit them without leaving the streaming site.
- Provides quick links to the album on the service you are browsing and to the Vinyl Vote site.
- Reminds you on a configurable interval while giving you a floating button for manual access.

## Development setup

1. Update `options` in the extension UI (or via `chrome://extensions`) so the **Vinyl Vote site URL** matches your environment. For local testing use `http://127.0.0.1:5000`.
2. Ensure the Flask app is running and you are logged in via the browser.
3. Open `chrome://extensions`, enable **Developer mode** and choose **Load unpacked** pointing to this folder.
4. Visit Spotify/Apple Music/YouTube and the overlay will appear if you still need to vote.

Firefox supports Manifest V3 via the `browser` namespace. You can load this extension temporarily by visiting `about:debugging#/runtime/this-firefox` and using **Load Temporary Add-on…**.

## Customisation

The extension stores its settings in `chrome.storage.sync` under `vinylVoteSettings`:

- `apiOrigin`: Base URL for the Vinyl Vote server (defaults to `https://vinyl.vote`).
- `autoPrompt`: Whether to automatically open the reminder overlay on supported sites.
- `remindIntervalHours`: Minimum hours between automatic reminders for the same album.

Draft votes are saved in `chrome.storage.local` using the key prefix `vinylVote:draft:` so they persist per album until you submit or dismiss them.