# Native Gallery Organizer (Android)

A native Android app built with React Native and Expo that organizes your phone's camera roll directly in place without making duplicate files:
- **Custom Titles:** Add and edit titles on any photo, saved locally in SQLite.
- **Search:** Instant search across all custom titles and filenames.
- **Auto-Sort:** One-click grouping of screenshots into a dedicated "Screenshots" album.
- **Duplicate & Burst Grouping:** Automatically groups photos with identical dimensions and timestamps.

---

## 📥 How to Download the Standalone APK

1. Go to the **Actions** tab in this GitHub repository.
2. Click on the latest **Build Android APK** workflow run.
3. Scroll down to **Artifacts** at the bottom of the page.
4. Click **GalleryOrganizer-Android-APK** to download the zip file.
5. Unzip on your Android phone and tap `app-debug.apk` to install!

---

## 🛠 Building with EAS Build (Alternative)

If you have an Expo account and prefer building via EAS:
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```
