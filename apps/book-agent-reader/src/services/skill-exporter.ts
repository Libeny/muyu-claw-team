import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImportedBook } from '../domain/book.js';
import type { SessionBookmark } from '../domain/session.js';

export class SkillExporter {
  renderSkill(input: { book: ImportedBook; sessions: SessionBookmark[] }): string {
    const title = `${input.book.manifest.title} 阅读技能`;
    const insights = input.sessions.length
      ? input.sessions.map((session) => `- ${session.title}：${session.summary}`).join('\n')
      : '- 暂无沉淀会话。';

    return [
      '---',
      `name: ${sanitizeSkillName(input.book.manifest.title)}`,
      `description: 使用《${input.book.manifest.title}》的阅读笔记和用户沉淀观点辅助思考。`,
      '---',
      '',
      `# ${title}`,
      '',
      '## 使用原则',
      '',
      '- 优先使用用户沉淀的摘要和观点。',
      '- 不复述大段原书内容。',
      '- 当证据不足时，明确说明需要回到原书确认。',
      '',
      '## 已沉淀观点',
      '',
      insights,
      '',
    ].join('\n');
  }

  async writeSkill(homeDir: string, input: { book: ImportedBook; sessions: SessionBookmark[] }): Promise<string> {
    const outputPath = path.join(homeDir, 'books', input.book.manifest.id, 'exports', 'skill', 'SKILL.md');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, this.renderSkill(input), 'utf-8');
    return outputPath;
  }
}

function sanitizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'book-reading-skill';
}
