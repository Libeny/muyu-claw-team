import type { AgentRequest, AgentResponse } from '../domain/agent.js';

export class MockAgent {
  async respond(request: AgentRequest): Promise<AgentResponse> {
    const selected = request.context.selectedText || request.question;
    if (request.mode === 'translate') {
      return {
        answer: `“${selected}”在当前上下文中可以理解为：与本页主题相关的表达。建议结合原句理解，而不是只看孤立词义。`,
        title: `翻译：${clip(selected, 18)}`,
        summary: `解释了“${clip(selected, 24)}”的上下文含义。`,
        suggestedVocab: selected
          ? [{ term: selected, translation: '上下文释义', sourceSentence: request.context.currentPageText }]
          : [],
      };
    }

    if (request.mode === 'summarize-chapter') {
      return {
        answer: [
          `本章《${request.context.chapterTitle}》围绕当前页面中的核心概念展开。`,
          '',
          '核心论点：作者通过当前段落说明信任如何降低理解和决策成本。',
          '关键概念：信任、品牌设计、决策成本。',
          '',
          '思考问题：哪些视觉线索会让你更信任一个品牌？',
          '思考问题：这个观点能否迁移到产品设计或个人表达？',
        ].join('\n'),
        title: `章节概要：${request.context.chapterTitle}`,
        summary: `总结了《${request.context.chapterTitle}》的核心内容并给出思考方向。`,
      };
    }

    return {
      answer: [
        `结合《${request.context.bookTitle}》第 ${request.context.pageIndex + 1} 页，这里重点讨论的是：${clip(selected || request.context.currentPageText, 80)}。我的建议是把这段放回章节“${request.context.chapterTitle}”中理解，它更像是在支撑本章的核心论证，而不是一个孤立句子。`,
        renderChapterSummary(request.context.chapterSummary),
        renderHighlights(request.context.highlights),
        renderImageContexts(request.context.imageContexts),
        renderRelatedPassages(request.context.relatedPassages),
      ]
        .filter(Boolean)
        .join('\n\n'),
      title: `关于：${clip(selected || request.question, 18)}`,
      summary: `围绕“${clip(selected || request.question, 24)}”进行了上下文解释。`,
    };
  }
}

function renderChapterSummary(summary: import('../domain/chapter-summary.js').ChapterSummary | undefined): string {
  if (!summary) return '';
  return `已保存章节概要：${clip(summary.summary, 120)}`;
}

function renderHighlights(highlights: import('../domain/highlight.js').Highlight[]): string {
  if (!highlights.length) return '';
  return ['相关高亮：', ...highlights.slice(0, 3).map((highlight) => `- ${clip(highlight.text, 80)}`)].join('\n');
}

function renderRelatedPassages(passages: import('../domain/book.js').RelatedPassage[]): string {
  if (!passages.length) return '';
  return [
    '相关书籍片段：',
    ...passages.slice(0, 3).map((passage) => `- 《${passage.bookTitle}》${passage.chapterTitle}：${clip(passage.text, 90)}`),
  ].join('\n');
}

function renderImageContexts(images: import('../domain/book.js').ImageAsset[]): string {
  if (!images.length) return '';
  return [
    '相关图片上下文：',
    ...images
      .slice(0, 3)
      .map((image) => `- ${clip([image.altText, image.caption].filter(Boolean).join('：'), 120)}`),
  ].join('\n');
}

function clip(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
