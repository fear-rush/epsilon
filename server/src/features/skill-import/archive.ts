/**
 * Unpacking an uploaded archive into entries in memory, never onto disk: the
 * store decides what is written and where, after the path checks. `.zip` goes
 * through fflate; tar is read here, because a tar header is 512 bytes and the
 * links and modes in it are exactly what the import has to see.
 */
import { Gunzip, unzipSync } from "fflate";
import { IMPORT_MAX_UPLOAD_BYTES } from "shared";

/** The most an archive may unpack to, so a small upload cannot fill the disk. */
const MAX_UNPACKED_BYTES = IMPORT_MAX_UPLOAD_BYTES * 2;

export type ArchiveEntry = {
	/** The path inside the archive, as written there. */
	path: string;
	kind: "file" | "directory" | "link";
	bytes: Uint8Array;
	/** The unix mode, when the archive records one. */
	mode: number | undefined;
};

export type ArchiveKind = "zip" | "tar" | "tgz";

/** Which archive these bytes are, from their magic numbers and then the file name. */
export const archiveKindOf = (name: string, bytes: Uint8Array): ArchiveKind | undefined => {
	if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
		return "zip";
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) return "tgz";
	const magic = new TextDecoder().decode(bytes.subarray(257, 262));
	if (magic === "ustar") return "tar";
	const lower = name.toLowerCase();
	if (lower.endsWith(".tar")) return "tar";
	return undefined;
};

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/**
 * The unix modes of a zip's entries, from its central directory. fflate does not
 * expose them, and they are how a symlink or an executable shows in a zip.
 */
const zipModes = (data: Uint8Array): Map<string, number> => {
	const modes = new Map<string, number>();
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let end = data.length - 22;
	while (end >= 0 && end >= data.length - 22 - 0xffff && view.getUint32(end, true) !== 0x06054b50) {
		end -= 1;
	}
	if (end < 0) return modes;
	const count = view.getUint16(end + 10, true);
	let offset = view.getUint32(end + 16, true);
	for (let entry = 0; entry < count && offset + 46 <= data.length; entry += 1) {
		if (view.getUint32(offset, true) !== 0x02014b50) break;
		const madeBy = view.getUint16(offset + 4, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const attributes = view.getUint32(offset + 38, true);
		const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
		if (madeBy >>> 8 === 3) modes.set(name, attributes >>> 16);
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return modes;
};

const readZip = (data: Uint8Array): ArchiveEntry[] => {
	let total = 0;
	const files = unzipSync(data, {
		filter: (file) => {
			total += file.originalSize;
			if (total > MAX_UNPACKED_BYTES) {
				throw new Error(`The archive unpacks to more than ${MAX_UNPACKED_BYTES / 1024 / 1024} MB`);
			}
			return true;
		},
	});
	const modes = zipModes(data);
	return Object.entries(files).map(([path, bytes]) => {
		const mode = modes.get(path);
		const link = mode !== undefined && (mode & S_IFMT) === S_IFLNK;
		return {
			path,
			kind: link ? "link" : path.endsWith("/") ? "directory" : "file",
			bytes,
			mode: mode === undefined ? undefined : mode & 0o777,
		};
	});
};

/** The bytes of a gzip stream, refused once they pass the unpacked limit. */
const gunzip = (data: Uint8Array): Uint8Array => {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const stream = new Gunzip((chunk) => {
		total += chunk.length;
		if (total > MAX_UNPACKED_BYTES) {
			throw new Error(`The archive unpacks to more than ${MAX_UNPACKED_BYTES / 1024 / 1024} MB`);
		}
		chunks.push(chunk);
	});
	stream.push(data, true);
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
};

const text = (block: Uint8Array): string => {
	const end = block.indexOf(0);
	return new TextDecoder().decode(end === -1 ? block : block.subarray(0, end));
};

const octal = (block: Uint8Array): number => Number.parseInt(text(block).trim() || "0", 8);

/** A pax record list (`<len> key=value\n`) as a map. */
const paxRecords = (body: Uint8Array): Map<string, string> => {
	const records = new Map<string, string>();
	const source = new TextDecoder().decode(body);
	let at = 0;
	while (at < source.length) {
		const space = source.indexOf(" ", at);
		if (space === -1) break;
		const length = Number.parseInt(source.slice(at, space), 10);
		if (!Number.isFinite(length) || length <= 0) break;
		const record = source.slice(space + 1, at + length - 1);
		const equals = record.indexOf("=");
		if (equals !== -1) records.set(record.slice(0, equals), record.slice(equals + 1));
		at += length;
	}
	return records;
};

const readTar = (data: Uint8Array): ArchiveEntry[] => {
	const entries: ArchiveEntry[] = [];
	let offset = 0;
	let longName: string | undefined;
	let pax = new Map<string, string>();
	while (offset + 512 <= data.length) {
		const header = data.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const size = octal(header.subarray(124, 136));
		const type = String.fromCharCode(header[156] ?? 0);
		const body = data.subarray(offset + 512, offset + 512 + size);
		if (body.length < size) throw new Error("The archive is cut short");
		offset += 512 + Math.ceil(size / 512) * 512;

		if (type === "L") {
			longName = text(body);
			continue;
		}
		if (type === "x") {
			pax = paxRecords(body);
			continue;
		}
		if (type === "g") continue;

		const prefix = text(header.subarray(345, 500));
		const base = text(header.subarray(0, 100));
		const path = pax.get("path") ?? longName ?? (prefix === "" ? base : `${prefix}/${base}`);
		longName = undefined;
		pax = new Map();
		const mode = octal(header.subarray(100, 108)) & 0o777;
		if (type === "0" || type === "\0" || type === "7") {
			entries.push({ path, kind: "file", bytes: body, mode });
		} else if (type === "5") {
			entries.push({ path, kind: "directory", bytes: new Uint8Array(), mode });
		} else if (type === "1" || type === "2") {
			entries.push({ path, kind: "link", bytes: new Uint8Array(), mode });
		}
		// Devices, FIFOs and other kinds carry nothing a skill can use.
	}
	return entries;
};

/** Every entry of a zip, tar or gzipped tar. Throws one sentence when the bytes are not one. */
export const readArchive = (name: string, data: Uint8Array): ArchiveEntry[] => {
	const kind = archiveKindOf(name, data);
	if (kind === undefined) {
		throw new Error(`${name} is not a .zip, .tar, .tar.gz or .tgz archive`);
	}
	try {
		if (kind === "zip") return readZip(data);
		return readTar(kind === "tgz" ? gunzip(data) : data);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		throw new Error(`${name} could not be unpacked: ${message || "it is damaged"}`, {
			cause: error,
		});
	}
};
