# Build troubleshooting

## Maven Central returns HTTP 429 ("Your ip has exceeded rate limits")
This happens on shared or cloud IP addresses. Point Gradle at Google's official Maven Central mirror with an init script at `~/.gradle/init.d/maven-central-mirror.gradle`:

```groovy
def MIRROR = 'https://maven-central.storage-download.googleapis.com/maven2/'
def isCentral = { u -> u.startsWith('https://repo.maven.apache.org') || u.startsWith('https://repo1.maven.org') }
def fix = { RepositoryHandler repos ->
  repos.withType(MavenArtifactRepository).configureEach { r -> if (isCentral(r.url.toString())) r.url = MIRROR }
  if (!repos.findByName('CentralMirror')) {
    def m = repos.maven { name = 'CentralMirror'; url = MIRROR }
    repos.remove(m); repos.add(0, m)
  }
}
beforeSettings { s -> fix(s.pluginManagement.repositories); s.pluginManagement.repositories.google(); s.pluginManagement.repositories.gradlePluginPortal(); fix(s.buildscript.repositories) }
allprojects { fix(buildscript.repositories); fix(repositories) }
```

## JitPack (jitpack.io) is blocked
`react-native-compressor` depends on `com.github.kaushik-naik:TAndroidLame` from JitPack. This library does MP3 encoding, which the app never uses (it only compresses video).

On normal networks, JitPack works and nothing needs to change.

The v0.1.0 APK was built on a network without JitPack access. For that build, a small no-op stand-in for the unused audio classes (`LameBuilder`, `AndroidLame`, `WaveReader`) was served from a local Maven repository (`~/.m2-local`). Video compression is unaffected.

If you need the same workaround, compile those three classes with matching signatures into `TAndroidLame-277c2ab4b0.jar`. Put it under `~/.m2-local/com/github/kaushik-naik/TAndroidLame/277c2ab4b0/` with a minimal POM, and add that folder as the first Maven repository for the `com.github.kaushik-naik` group.

## "Cannot find a Java installation matching languageVersion=17"
Install JDK 17 (`apt-get install openjdk-17-jdk-headless`) and set `JAVA_HOME`, or let `scripts/build-apk.sh` pick it up automatically.

## Out of memory during the build
Lower parallelism: `npm run build:apk -- --max-workers=2`.
