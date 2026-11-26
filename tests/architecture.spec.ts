// Quy tắc phân tầng: chỉ main.ts và views/ được import views/ (xem knowledge.md, R1).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('phân tầng mã nguồn', () => {
  it('domain/, export/, calc/, store/, sync/, sign/, auth/ không phụ thuộc views/', () => {
    const bad = files(SRC)
      .map((p) => relative(SRC, p).replace(/\\/g, '/'))
      .filter((r) => r !== 'main.ts' && !r.startsWith('views/'))
      .filter((r) => /from '(\.\.\/)+views\/|from '\.\/views\//.test(readFileSync(join(SRC, r), 'utf8')));
    expect(bad).toEqual([]);
  });
});
