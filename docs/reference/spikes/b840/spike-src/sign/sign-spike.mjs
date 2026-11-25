// B840 S8: SHA-256 of a 20 MB package and Ed25519 verification in Electron's main process.
import { createHash, createPublicKey, verify, generateKeyPairSync, sign } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = { versions: { electron: process.versions.electron, node: process.versions.node, openssl: process.versions.openssl, boringssl: process.versions.boringssl } };
  const file = join(here, 'pkg.bin');
  const times = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); createHash('sha256').update(readFileSync(file)).digest('hex'); times.push(performance.now() - t); }
  out.sha256InMemoryMs = times.map((x) => +x.toFixed(1));
  const st = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await new Promise((res) => { const h = createHash('sha256'); createReadStream(file).on('data', (c) => h.update(c)).on('end', () => { h.digest('hex'); res(); }); });
    st.push(performance.now() - t);
  }
  out.sha256StreamMs = st.map((x) => +x.toFixed(1));
  const pub = createPublicKey(readFileSync(join(here, 'signing.pub.pem')));
  out.keyType = pub.asymmetricKeyType;
  const data = readFileSync(join(here, 'index.json'));
  const sig = Buffer.from(readFileSync(join(here, 'index.json.sig'), 'utf8'), 'base64');
  const vt = performance.now();
  out.verifyOpenSslSignature = verify(null, data, pub, sig);
  out.verifyMs = +(performance.now() - vt).toFixed(3);
  out.verifyTampered = verify(null, Buffer.concat([data, Buffer.from(' ')]), pub, sig);
  const kp = generateKeyPairSync('ed25519');
  out.signAndVerifyInProcess = verify(null, data, kp.publicKey, sign(null, data, kp.privateKey));
  out.publicKeyRaw = pub.export({ format: 'jwk' }).x;
  writeFileSync(join(here, `results-s8-${process.env.ELECTRON_RUN_AS_NODE ? 'node' : 'main'}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) { const { app } = await import('electron'); app.quit(); }
}
void main();
