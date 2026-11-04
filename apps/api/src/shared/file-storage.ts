import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { ForbiddenError, NotFoundError } from './errors.ts';

export interface FileStorage {
  put(relativePath: string, data: Uint8Array | string): Promise<string>;
  get(relativePath: string): Promise<Buffer>;
  exists(relativePath: string): Promise<boolean>;
  delete(relativePath: string): Promise<void>;
}

export class LocalDiskFileStorage implements FileStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  private resolveSafePath(relativePath: string): string {
    const cleaned = relativePath.replace(/^[/\\]+/, '');
    const target = resolve(this.baseDir, cleaned);
    const prefix = this.baseDir.endsWith(sep) ? this.baseDir : `${this.baseDir}${sep}`;
    if (target !== this.baseDir && !target.startsWith(prefix)) {
      throw new ForbiddenError('Ruta de almacenamiento inválida.');
    }
    return target;
  }

  async put(relativePath: string, data: Uint8Array | string): Promise<string> {
    const target = this.resolveSafePath(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return relativePath;
  }

  async get(relativePath: string): Promise<Buffer> {
    const target = this.resolveSafePath(relativePath);
    try {
      return await readFile(target);
    } catch {
      throw new NotFoundError('El archivo solicitado no existe.');
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const target = this.resolveSafePath(relativePath);
    try {
      const info = await stat(target);
      return info.isFile();
    } catch {
      return false;
    }
  }

  async delete(relativePath: string): Promise<void> {
    const target = this.resolveSafePath(relativePath);
    await rm(target, { force: true });
  }
}
