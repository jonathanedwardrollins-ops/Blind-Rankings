# BlindRank Live

A real-time blind ranking party game built as a static web app. Host a room, reveal items one by one, and force everyone to lock in a 1-10 slot before the next reveal.

## Setup

1) Create a Firebase project and enable Firestore.
2) Copy your Firebase web config into `config.js`.
3) Set Firestore rules (see below).
4) Open `index.html` locally or deploy on GitHub Pages.

## Firestore Rules (dev)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if true;
      match /players/{playerId} {
        allow read, write: if true;
      }
    }
  }
}
```

## GitHub Pages

- Push this folder to a repo.
- In GitHub, enable Pages on the main branch and root.
- Visit the published URL.

## Notes

- Multiplayer sync uses Firestore snapshots. Any client can advance when the timer hits zero or everyone has submitted.
- Room codes are 4 characters to keep joining quick.
