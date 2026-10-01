import { markdownToPlainText, markdownToSafeHtml } from './rich-text.js';

describe('markdownToSafeHtml', () => {
  it('renders ordinary Markdown', () => {
    const html = markdownToSafeHtml(
      '## Why this book\n\nThe **first law**, explained with *worked* examples.\n\n- Heat\n- Work',
    );
    expect(html).toContain('<h2>Why this book</h2>');
    expect(html).toContain('<strong>first law</strong>');
    expect(html).toContain('<li>Heat</li>');
  });

  it('strips scripts, event handlers, iframes and inline styles', () => {
    const html = markdownToSafeHtml(
      'Hi <script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://evil"></iframe><p style="color:red" onclick="x()">styled</p>',
    );
    expect(html).not.toMatch(/script|onerror|onclick|iframe|style=|<img/i);
    expect(html).toContain('styled');
  });

  it('removes javascript: links and hardens real ones', () => {
    expect(markdownToSafeHtml('[click](javascript:alert(1))')).not.toContain(
      'javascript',
    );
    const html = markdownToSafeHtml('[site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });

  it('demotes h1 so the page keeps one title', () => {
    expect(markdownToSafeHtml('# Big')).toBe('<h2>Big</h2>');
  });

  it('keeps tables (engineering data)', () => {
    const html = markdownToSafeHtml(
      '| Material | E (GPa) |\n|---|---|\n| Steel | 200 |',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<td>200</td>');
  });
});

describe('markdownToPlainText', () => {
  it('flattens to text', () => {
    expect(markdownToPlainText('## Title\n\nSome **bold** text.')).toBe(
      'Title Some bold text.',
    );
  });
});
