// Data-preserving Android updates. Never delegates installation to flutter run.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageId = 'com.example.bible_mind_core';
export const productionApi = 'https://api.onaria.ai.kr';
export const releaseCert = '692eabafe55986612f5aa3d475cea16e0e5e7db20ce2e09219a2f536f7e8f6bb';

export function execute(file, args, cwd) {
  try {
    if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(file)) {
      const quote = value => {
        if (/["%\r\n!&|<>^]/.test(value)) throw Error('Unsupported command path');
        return `"${value}"`;
      };
      return execFileSync('cmd.exe', ['/d', '/s', '/c', `"${[file, ...args].map(quote).join(' ')}"`],
        { cwd, windowsVerbatimArguments: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    }
    return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const code = `${error.stdout || ''} ${error.stderr || ''}`.match(/INSTALL_FAILED_[A-Z_]+/)?.[0];
    // Do not echo build output: local tool errors can contain signing settings.
    throw Error(code || `Tool failed (${error.status ?? 'launch'}); update stopped without deleting data`);
  }
}

export function certificate(output) {
  const fingerprints = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/gim)].map(m => m[1].toLowerCase());
  if (fingerprints.length !== 1) throw Error('Expected exactly one APK signing certificate');
  return fingerprints[0];
}

export function updateRelease({ root, tools, device, run = execute, report = console.log }) {
  const call = (tool, args) => run(tools[tool], args, root);
  const listing = call('adb', ['devices']);
  const devices = listing.split(/\r?\n/).map(line => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && ['device', 'unauthorized', 'offline'].includes(state));
  if (!device) {
    if (devices.length !== 1) throw Error('Connect one Android device or specify -Device SERIAL');
    device = devices[0][0];
  }
  const state = devices.find(([serial]) => serial === device)?.[1];
  if (state === 'unauthorized') throw Error('Allow USB debugging on the phone, then retry');
  if (state !== 'device') throw Error('Selected device is not connected and authorized');
  const adb = args => call('adb', ['-s', device, ...args]);
  const installed = adb(['shell', 'pm', 'path', packageId]);
  const base = installed.split(/\r?\n/).find(line => /^package:\/[^\r\n]*\/base\.apk$/.test(line));
  let previousVersion = null;
  if (installed.trim() && !base) throw Error('Could not identify installed base APK; stopped');
  if (base) {
    const snapshot = join(mkdtempSync(join(tmpdir(), 'onaria-cert-')), 'installed.apk');
    // Copies APK code only, never app data. No recursive cleanup operation.
    adb(['pull', base.slice('package:'.length), snapshot]);
    if (certificate(call('signer', ['verify', '--print-certs', snapshot])) !== releaseCert) {
      throw Error('Installed certificate differs from the approved release key; stopped');
    }
    const details = adb(['shell', 'dumpsys', 'package', packageId]);
    previousVersion = details.match(/\bversionCode=(\d+)/)?.[1];
    if (!previousVersion) throw Error('Installed versionCode unavailable; stopped');
  }
  if (!existsSync(join(root, 'android/key.properties')) || !existsSync(join(root, 'android/soul-bible-release.jks'))) {
    throw Error('Existing release keystore/key.properties required; no key will be generated');
  }
  report('Building release with the official API; signing secrets are not printed.');
  call('flutter', ['pub', 'get']);
  call('flutter', ['build', 'apk', '--release', `--dart-define=ONARIA_API_BASE_URL=${productionApi}`]);
  const apk = join(root, 'build/app/outputs/flutter-apk/app-release.apk');
  if (!existsSync(apk)) throw Error('Release APK missing');
  if (certificate(call('signer', ['verify', '--print-certs', apk])) !== releaseCert) throw Error('Built APK certificate mismatch; stopped');
  const badging = call('aapt', ['dump', 'badging', apk]);
  const metadata = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m);
  if (!metadata || metadata[1] !== packageId || /^application-debuggable\b/m.test(badging)) throw Error('APK must be the non-debuggable production package');
  if (previousVersion && BigInt(metadata[2]) < BigInt(previousVersion)) throw Error('Version downgrade refused; keep the newer installed app');
  const result = adb(['install', '-r', apk]);
  if (!/^Success\s*$/m.test(result) || /Failure|INSTALL_FAILED_/.test(result)) throw Error('Update failed; stopped without uninstall or retry');
  report(`Installed ${packageId} ${metadata[3]}+${metadata[2]} with adb install -r.`);
  const launch = adb(['shell', 'am', 'start', '-W', '-n', `${packageId}/.MainActivity`]);
  if (!/^Status: ok\s*$/m.test(launch)) throw Error('Update installed; application launch not confirmed');
  report('Application launch confirmed.');
  return { apk, packageId, version: metadata[3], versionCode: metadata[2], certificate: releaseCert, api: productionApi };
}

export function discoverTools(root) {
  const windows = process.platform === 'win32';
  if (windows && !process.env.JAVA_HOME) {
    const bundledJdk = join(process.env.ProgramFiles || 'C:/Program Files', 'Android/Android Studio/jbr');
    if (existsSync(join(bundledJdk, 'bin/java.exe'))) process.env.JAVA_HOME = bundledJdk;
  }
  const find = name => {
    for (const directory of (process.env.PATH || '').split(delimiter)) {
      for (const suffix of windows ? ['.exe', '.bat', '.cmd'] : ['']) {
        const candidate = join(directory, name + suffix);
        if (existsSync(candidate)) return candidate;
      }
    }
    return null;
  };
  const propertiesPath = join(root, 'android/local.properties');
  const properties = existsSync(propertiesPath) ? readFileSync(propertiesPath, 'utf8') : '';
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    properties.match(/^sdk\.dir=(.*)$/m)?.[1].trim().replace(/\\([\\:])/g, '$1');
  if (!sdk) throw Error('Android SDK path unavailable');
  const flutterRoot = properties.match(/^flutter\.sdk=(.*)$/m)?.[1].trim().replace(/\\([\\:])/g, '$1');
  // Build-tools 36 is the current project baseline; no signing config mutation.
  const tools = { adb: join(sdk, 'platform-tools', windows ? 'adb.exe' : 'adb'),
    signer: join(sdk, 'build-tools/36.0.0', windows ? 'apksigner.bat' : 'apksigner'),
    aapt: join(sdk, 'build-tools/36.0.0', windows ? 'aapt.exe' : 'aapt'),
    flutter: find('flutter') || (flutterRoot && join(flutterRoot, 'bin', windows ? 'flutter.bat' : 'flutter')) };
  for (const [name, path] of Object.entries(tools)) if (!path || !existsSync(path)) throw Error(`${name} unavailable; verify SDK/build-tools/PATH`);
  return tools;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    if (process.argv.length > 3) throw Error('Only an optional device serial is accepted');
    updateRelease({ root, tools: discoverTools(root), device: process.argv[2] });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
