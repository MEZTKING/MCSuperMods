// B780 spike (throwaway): a minimal headless stand-in player for a local offline-mode server.
// It logs in, finishes the configuration phase, answers keep-alives, pings and teleports, and can break a
// block (creative), respawn, run a command, click a menu slot and read chat, titles, menus, dialogs and the
// death screen. Packet ids come from the vanilla server's own data generator report (packets.json), read at
// run time; the formats are the public protocol's. No Mojang code or file is kept.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { deflateSync, inflateSync } from 'node:zlib';

export function packetIds(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const ids = {};
  for (const [phase, dirs] of Object.entries(report)) {
    ids[phase] = {};
    for (const [dir, packets] of Object.entries(dirs)) {
      ids[phase][dir] = {};
      for (const [name, v] of Object.entries(packets)) ids[phase][dir][name.split(':')[1]] = v.protocol_id;
    }
  }
  return ids;
}

// ---- writing
function varint(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return Buffer.from(out);
}
const str = (s) => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
};
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const i16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const f32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeFloatBE(n);
  return b;
};
const i64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(BigInt.asIntN(64, n));
  return b;
};
const position = (x, y, z) =>
  i64(((BigInt(x) & 0x3ffffffn) << 38n) | ((BigInt(z) & 0x3ffffffn) << 12n) | (BigInt(y) & 0xfffn));

function offlineUuid(name) {
  const h = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  return h;
}

// ---- reading
class Reader {
  constructor(buf) {
    this.b = buf;
    this.o = 0;
  }
  varint() {
    let n = 0;
    let shift = 0;
    for (;;) {
      const byte = this.b[this.o++];
      n |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return n;
      shift += 7;
    }
  }
  str() {
    const n = this.varint();
    const s = this.b.toString('utf8', this.o, this.o + n);
    this.o += n;
    return s;
  }
  i32() {
    const v = this.b.readInt32BE(this.o);
    this.o += 4;
    return v;
  }
  i64() {
    const v = this.b.readBigInt64BE(this.o);
    this.o += 8;
    return v;
  }
  f32() {
    const v = this.b.readFloatBE(this.o);
    this.o += 4;
    return v;
  }
  f64() {
    const v = this.b.readDoubleBE(this.o);
    this.o += 8;
    return v;
  }
  bool() {
    return this.b[this.o++] !== 0;
  }
  rest() {
    return this.b.subarray(this.o);
  }
  // Network NBT (no root name), returned as plain JS values.
  nbt() {
    const type = this.b[this.o++];
    return this.tag(type);
  }
  tag(type) {
    const b = this.b;
    switch (type) {
      case 0:
        return null;
      case 1:
        return b.readInt8(this.o++);
      case 2: {
        const v = b.readInt16BE(this.o);
        this.o += 2;
        return v;
      }
      case 3:
        return this.i32();
      case 4:
        return this.i64();
      case 5:
        return this.f32();
      case 6:
        return this.f64();
      case 7: {
        const n = this.i32();
        const v = b.subarray(this.o, this.o + n);
        this.o += n;
        return v;
      }
      case 8: {
        const n = b.readUInt16BE(this.o);
        this.o += 2;
        const s = b.toString('utf8', this.o, this.o + n);
        this.o += n;
        return s;
      }
      case 9: {
        const t = b[this.o++];
        const n = this.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.tag(t));
        return out;
      }
      case 10: {
        const out = {};
        for (;;) {
          const t = b[this.o++];
          if (t === 0) return out;
          const n = b.readUInt16BE(this.o);
          this.o += 2;
          const name = b.toString('utf8', this.o, this.o + n);
          this.o += n;
          out[name] = this.tag(t);
        }
      }
      case 11: {
        const n = this.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.i32());
        return out;
      }
      case 12: {
        const n = this.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.i64());
        return out;
      }
      default:
        throw new Error(`nbt tag ${type}`);
    }
  }
}

/** The plain text of a text component (string, list or compound with text, translate, with, extra). */
export function plain(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(plain).join('');
  let s = '';
  if (typeof c.text === 'string') s += c.text;
  else if (c[''] !== undefined) s += plain(c['']);
  if (typeof c.translate === 'string') s += c.with ? `${c.translate}(${c.with.map(plain).join(', ')})` : c.translate;
  if (c.extra) s += plain(c.extra);
  return s;
}

// 26.3's teleport confirmation carries the id and a position (found by the server's own decode error).
// 26.3's teleport confirmation carries the id, the position and the two rotations (found from the server's own
// decode errors: a double after the id, then a float after three doubles).
function acceptBody(tp, pos, rot) {
  const b = Buffer.alloc(32);
  b.writeDoubleBE(pos[0], 0);
  b.writeDoubleBE(pos[1], 8);
  b.writeDoubleBE(pos[2], 16);
  b.writeFloatBE(rot[0], 24);
  b.writeFloatBE(rot[1], 28);
  return Buffer.concat([varint(tp), b]);
}

export class Bot {
  constructor({ name, port, host = '127.0.0.1', ids, protocol, log = () => {} }) {
    Object.assign(this, { name, port, host, ids, protocol, log });
    this.state = 'login';
    this.threshold = -1;
    this.buf = Buffer.alloc(0);
    this.chat = [];
    this.titles = [];
    this.events = [];
    this.loaded = false;
    this.deathScreen = 0;
    this.health = 20;
    this.screen = null;
    this.stateId = 0;
    this.dialogs = 0;
    this.disconnect = null;
    this.teleports = 0;
  }

  /** Resolves once in play and the first teleport is confirmed; rejects with the server's reason if refused. */
  connect() {
    return new Promise((resolve, reject) => {
      this.onReady = resolve;
      this.onRefused = reject;
      this.sock = connect(this.port, this.host, () => {
        this.sendRaw(0, Buffer.concat([varint(this.protocol), str(this.host), u16(this.port), varint(2)]));
        this.send('login', 'hello', Buffer.concat([str(this.name), offlineUuid(this.name)]));
      });
      this.sock.on('data', (d) => this.onData(d));
      this.sock.on('close', () => {
        this.closed = true;
        if (this.onRefused) this.onRefused(new Error(`closed: ${this.disconnect ?? 'no reason'}`));
      });
      this.sock.on('error', (e) => this.onRefused?.(e));
    });
  }

  close() {
    this.sock?.destroy();
  }

  sendRaw(id, body) {
    const data = Buffer.concat([varint(id), body]);
    let frame;
    if (this.threshold >= 0) {
      if (data.length >= this.threshold) {
        const z = deflateSync(data);
        const inner = Buffer.concat([varint(data.length), z]);
        frame = Buffer.concat([varint(inner.length), inner]);
      } else {
        const inner = Buffer.concat([varint(0), data]);
        frame = Buffer.concat([varint(inner.length), inner]);
      }
    } else frame = Buffer.concat([varint(data.length), data]);
    this.sock.write(frame);
  }

  send(phase, name, body = Buffer.alloc(0)) {
    const id = this.ids[phase].serverbound[name];
    if (id === undefined) throw new Error(`no serverbound ${phase} ${name}`);
    this.sendRaw(id, body);
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      // read a varint length
      let len = 0;
      let shift = 0;
      let i = 0;
      let complete = false;
      while (i < this.buf.length && i < 5) {
        const byte = this.buf[i++];
        len |= (byte & 0x7f) << shift;
        shift += 7;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
      }
      if (!complete || this.buf.length < i + len) return;
      let frame = this.buf.subarray(i, i + len);
      this.buf = this.buf.subarray(i + len);
      if (this.threshold >= 0) {
        const r = new Reader(frame);
        const size = r.varint();
        frame = size === 0 ? r.rest() : inflateSync(r.rest());
      }
      const r = new Reader(frame);
      const id = r.varint();
      try {
        this.handle(id, r);
      } catch (e) {
        this.log(`${this.name}: handling ${this.state} 0x${id.toString(16)} failed: ${e.message}`);
      }
    }
  }

  name_(id) {
    const table = this.ids[this.state === 'config' ? 'configuration' : this.state].clientbound;
    for (const [k, v] of Object.entries(table)) if (v === id) return k;
    return `?${id}`;
  }

  handle(id, r) {
    const n = this.name_(id);
    if (this.state === 'login') {
      if (n === 'login_compression') this.threshold = r.varint();
      else if (n === 'login_disconnect') {
        this.disconnect = r.str();
        this.log(`${this.name}: login refused: ${this.disconnect}`);
      } else if (n === 'login_finished') {
        this.send('login', 'login_acknowledged');
        this.state = 'config';
        this.send('configuration', 'client_information', Buffer.concat([str('en_us'), Buffer.from([4]), varint(0), Buffer.from([1, 0x7f]), varint(1), Buffer.from([0, 1]), varint(0)]));
      } else if (n === 'cookie_request') this.log(`${this.name}: cookie request`);
      return;
    }
    if (this.state === 'config') {
      switch (n) {
        case 'select_known_packs':
          this.send('configuration', 'select_known_packs', r.rest());
          break;
        case 'keep_alive':
          this.send('configuration', 'keep_alive', r.rest());
          break;
        case 'ping':
          this.send('configuration', 'pong', r.rest());
          break;
        case 'code_of_conduct':
          this.send('configuration', 'accept_code_of_conduct');
          break;
        case 'show_dialog':
          this.dialogs++;
          break;
        case 'disconnect':
          this.disconnect = plain(r.nbt());
          this.log(`${this.name}: disconnected in configuration: ${this.disconnect}`);
          break;
        case 'finish_configuration':
          this.send('configuration', 'finish_configuration');
          this.state = 'play';
          break;
        default:
      }
      return;
    }
    // play
    switch (n) {
      case 'keep_alive':
        this.send('play', 'keep_alive', r.rest());
        break;
      case 'ping':
        this.send('play', 'pong', r.rest());
        break;
      case 'player_position': {
        const tp = r.varint();
        this.pos = [r.f64(), r.f64(), r.f64()];
        r.f64();
        r.f64();
        r.f64();
        this.rot = [r.f32(), r.f32()];
        this.teleports++;
        this.send('play', 'accept_teleportation', acceptBody(tp, this.pos, this.rot));
        if (!this.loaded) {
          this.loaded = true;
          this.send('play', 'player_loaded');
          const ready = this.onReady;
          this.onReady = null;
          this.onRefused = null;
          ready?.();
        }
        break;
      }
      case 'chunk_batch_finished':
        this.send('play', 'chunk_batch_received', f32(20));
        break;
      case 'system_chat': {
        const text = plain(r.nbt());
        const overlay = r.bool();
        if (!overlay) this.chat.push(text);
        break;
      }
      case 'set_title_text':
        this.titles.push(plain(r.nbt()));
        break;
      case 'player_combat_kill':
        this.deathScreen++;
        this.events.push('death_screen');
        break;
      case 'set_health':
        this.health = r.f32();
        break;
      case 'open_screen': {
        const container = r.varint();
        const type = r.varint();
        this.screen = { container, type, title: plain(r.nbt()) };
        this.events.push(`open_screen ${this.screen.title}`);
        break;
      }
      case 'container_set_content': {
        const container = r.varint();
        const stateId = r.varint();
        if (this.screen && container === this.screen.container) this.stateId = stateId;
        break;
      }
      case 'container_close':
        this.events.push('container_close');
        this.screen = null;
        break;
      case 'show_dialog':
        this.dialogs++;
        this.events.push('show_dialog');
        break;
      case 'respawn':
        this.events.push('respawn');
        break;
      case 'start_configuration':
        this.send('play', 'configuration_acknowledged');
        this.state = 'config';
        break;
      case 'disconnect':
        this.disconnect = plain(r.nbt());
        this.log(`${this.name}: kicked: ${this.disconnect}`);
        break;
      default:
    }
  }

  /** Creative break: one START_DESTROY_BLOCK action. */
  breakBlock(x, y, z, sequence = 1) {
    this.send('play', 'player_action', Buffer.concat([varint(0), position(x, y, z), Buffer.from([1]), varint(sequence)]));
  }

  respawn() {
    this.send('play', 'client_command', varint(0));
  }

  command(text) {
    this.send('play', 'chat_command', str(text));
  }

  moveTo(x, y, z) {
    const b = Buffer.alloc(25);
    b.writeDoubleBE(x, 0);
    b.writeDoubleBE(y, 8);
    b.writeDoubleBE(z, 16);
    b[24] = 1; // on ground
    this.send('play', 'move_player_pos', b);
  }

  /** A left click on a menu slot with nothing carried (container_click, mode PICKUP). */
  click(slot) {
    const s = this.screen;
    this.send(
      'play',
      'container_click',
      Buffer.concat([varint(s.container), varint(this.stateId), i16(slot), Buffer.from([0]), varint(0), varint(0), Buffer.from([0])]),
    );
  }

  takeChat() {
    const c = this.chat;
    this.chat = [];
    return c;
  }
}
