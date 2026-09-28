/**
 * 이미지 파일 저장소. 로컬 디스크(기본) 또는 S3 호환 오브젝트 스토리지(AWS S3, Cloudflare R2, MinIO …).
 * 파일은 공개 URL로 직접 노출하지 않고 /media/* 라우트가 권한(블라인드 여부)을 확인한 뒤 읽어서 내려준다.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { config } from "../config";

export interface ImageStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** 없으면 null */
  get(key: string): Promise<Buffer | null>;
  /** 없어도 오류 아님 */
  delete(key: string): Promise<void>;
}

/** 키는 코드가 만든 것만 허용한다 (경로 탈출 방지) */
const KEY = /^img\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.webp$/;
export function assertKey(key: string) {
  if (!KEY.test(key)) throw new Error(`invalid storage key: ${key}`);
}

export class LocalStorage implements ImageStorage {
  constructor(private readonly root: string) {}
  private file(key: string) {
    assertKey(key);
    return path.join(path.resolve(this.root), key);
  }
  async put(key: string, data: Buffer, _contentType?: string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // 쓰는 도중 읽히지 않도록 임시 파일에 쓴 뒤 이름을 바꾼다
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }
  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

export type S3Options = { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string };

/** S3 호환 스토리지 — path-style URL(<endpoint>/<bucket>/<key>), SigV4 서명 */
export class S3Storage implements ImageStorage {
  private readonly client: AwsClient;
  constructor(private readonly opts: S3Options) {
    this.client = new AwsClient({ accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey, region: opts.region, service: "s3" });
  }
  private url(key: string) {
    assertKey(key);
    return `${this.opts.endpoint}/${encodeURIComponent(this.opts.bucket)}/${key}`;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await this.client.fetch(this.url(key), { method: "PUT", body: new Uint8Array(data), headers: { "content-type": contentType } });
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  }
  async get(key: string) {
    const res = await this.client.fetch(this.url(key), { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(key: string) {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${key} failed: ${res.status}`);
  }
}

const g = globalThis as unknown as { __labelRepImageStorage?: ImageStorage };

export function imageStorage(): ImageStorage {
  if (!g.__labelRepImageStorage) {
    g.__labelRepImageStorage = config.imageStorage === "s3" ? new S3Storage(config.s3) : new LocalStorage(config.uploadDir);
  }
  return g.__labelRepImageStorage;
}

/** 테스트용: 저장소 교체 */
export function setImageStorage(s: ImageStorage | undefined) {
  g.__labelRepImageStorage = s;
}

export const fullKey = (id: string) => `img/${id}.webp`;
export const thumbKey = (id: string) => `img/${id}_t.webp`;
