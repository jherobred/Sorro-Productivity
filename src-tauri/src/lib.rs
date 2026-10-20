// The desktop app is a window on the live site, like the APK: each deploy
// reaches it on the next online launch, and the site's service worker plus its
// offline write queue cover launches with no connection.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Basedly");
}
