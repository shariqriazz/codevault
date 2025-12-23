import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSynthesisResult,
  formatStreamingChunk,
  extractCitations,
  addCitationFooter,
  formatErrorMessage,
  formatNoResultsMessage
} from '../synthesis/markdown-formatter.js';
import type { SynthesisResult } from '../synthesis/synthesizer.js';

/**
 * Comprehensive unit tests for markdown-formatter.ts
 *
 * Tests cover:
 * - formatSynthesisResult: metadata, stats, success/error cases
 * - formatStreamingChunk: passthrough behavior
 * - extractCitations: markdown link extraction, deduplication
 * - addCitationFooter: reference section generation
 * - formatErrorMessage: error formatting with suggestions
 * - formatNoResultsMessage: no results formatting with queries
 */

describe('formatSynthesisResult', () => {
  test('formats successful result with answer', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'The function handles authentication.',
      query: 'how does auth work',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result);

    assert.ok(output.includes('The function handles authentication.'));
  });

  test('includes metadata header when requested', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer here',
      query: 'test query',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: {
        searchType: 'hybrid',
        totalResults: 3
      }
    };

    const output = formatSynthesisResult(result, { includeMetadata: true });

    assert.ok(output.includes('Search Metadata'));
    assert.ok(output.includes('Search Type'));
    assert.ok(output.includes('hybrid'));
    assert.ok(output.includes('Chunks Analyzed'));
  });

  test('excludes metadata header when disabled', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer here',
      query: 'test query',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: {
        searchType: 'hybrid'
      }
    };

    const output = formatSynthesisResult(result, { includeMetadata: false });

    assert.ok(!output.includes('Search Metadata'));
  });

  test('includes stats footer when requested', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer here',
      query: 'test query',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result, { includeStats: true });

    assert.ok(output.includes('CodeVault'));
    assert.ok(output.includes('semantic search'));
  });

  test('excludes stats footer when disabled', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer here',
      query: 'test query',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result, { includeStats: false });

    assert.ok(!output.includes('semantic search + LLM synthesis'));
  });

  test('shows queries used when multiple', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'complex question',
      queriesUsed: ['query1', 'query2', 'query3'],
      chunksAnalyzed: 10,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: { multiQuery: true }
    };

    const output = formatSynthesisResult(result, { includeMetadata: true });

    assert.ok(output.includes('Queries Used'));
    assert.ok(output.includes('query1'));
    assert.ok(output.includes('query2'));
    assert.ok(output.includes('query3'));
  });

  test('shows multi-query indicator', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: { multiQuery: true }
    };

    const output = formatSynthesisResult(result, { includeMetadata: true });

    assert.ok(output.includes('Multi-Query'));
    assert.ok(output.includes('Yes'));
  });

  test('formats error result with error message', () => {
    const result: SynthesisResult = {
      success: false,
      error: 'API rate limit exceeded',
      query: 'test query',
      chunksAnalyzed: 0,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result);

    assert.ok(output.includes('Error'));
    assert.ok(output.includes('API rate limit exceeded'));
  });

  test('handles unknown error gracefully', () => {
    const result: SynthesisResult = {
      success: false,
      query: 'test query',
      chunksAnalyzed: 0,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result);

    assert.ok(output.includes('Unknown error occurred'));
  });

  test('includes embedding provider in metadata', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'voyage-3',
      metadata: {}
    };

    const output = formatSynthesisResult(result, { includeMetadata: true });

    assert.ok(output.includes('Embedding Provider'));
    assert.ok(output.includes('voyage-3'));
  });

  test('includes chat provider in metadata', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'Claude-3',
      embeddingProvider: 'openai',
      metadata: {}
    };

    const output = formatSynthesisResult(result, { includeMetadata: true });

    assert.ok(output.includes('Chat Provider'));
    assert.ok(output.includes('Claude-3'));
  });

  test('adds newline if answer does not end with one', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer without newline',
      query: 'test',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result, { includeStats: false });

    assert.ok(output.endsWith('\n'));
  });

  test('does not add extra newline if answer ends with one', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer with newline\n',
      query: 'test',
      chunksAnalyzed: 3,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result, { includeStats: false });

    // Should not have double newline at end of answer part
    assert.ok(!output.includes('Answer with newline\n\n\n'));
  });

  test('uses default options', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: { searchType: 'hybrid' }
    };

    const output = formatSynthesisResult(result);

    // Default includeMetadata and includeStats are true
    assert.ok(output.includes('Search Metadata'));
    assert.ok(output.includes('CodeVault'));
  });
});

describe('formatStreamingChunk', () => {
  test('passes through chunk unchanged', () => {
    const chunk = 'This is a streaming chunk of text.';
    const result = formatStreamingChunk(chunk);

    assert.equal(result, chunk);
  });

  test('handles empty chunk', () => {
    const result = formatStreamingChunk('');
    assert.equal(result, '');
  });

  test('preserves special characters', () => {
    const chunk = '```typescript\nconst x = 1;\n```';
    const result = formatStreamingChunk(chunk);

    assert.equal(result, chunk);
  });

  test('preserves newlines', () => {
    const chunk = 'line1\nline2\nline3';
    const result = formatStreamingChunk(chunk);

    assert.equal(result, chunk);
  });
});

describe('extractCitations', () => {
  test('extracts file path citations', () => {
    const markdown = 'See [auth.ts](src/auth.ts:42) for details.';
    const citations = extractCitations(markdown);

    assert.deepEqual(citations, ['src/auth.ts:42']);
  });

  test('extracts multiple citations', () => {
    const markdown = `
      Check [file1.ts](src/file1.ts:10) and [file2.ts](lib/file2.ts:20).
      Also see [file3.ts](utils/file3.ts:30).
    `;
    const citations = extractCitations(markdown);

    assert.equal(citations.length, 3);
    assert.ok(citations.includes('src/file1.ts:10'));
    assert.ok(citations.includes('lib/file2.ts:20'));
    assert.ok(citations.includes('utils/file3.ts:30'));
  });

  test('deduplicates citations', () => {
    const markdown = `
      See [auth.ts](src/auth.ts:42) here.
      And also [auth.ts](src/auth.ts:42) there.
    `;
    const citations = extractCitations(markdown);

    assert.equal(citations.length, 1);
    assert.deepEqual(citations, ['src/auth.ts:42']);
  });

  test('filters out HTTP URLs', () => {
    const markdown = `
      Check [Google](https://google.com) and [file](src/file.ts).
    `;
    const citations = extractCitations(markdown);

    assert.equal(citations.length, 1);
    assert.ok(!citations.some(c => c.includes('google.com')));
    assert.ok(citations.includes('src/file.ts'));
  });

  test('filters out HTTPS URLs', () => {
    const markdown = '[docs](https://docs.example.com) and [code](code.ts)';
    const citations = extractCitations(markdown);

    assert.equal(citations.length, 1);
    assert.deepEqual(citations, ['code.ts']);
  });

  test('returns empty array for no citations', () => {
    const markdown = 'This is plain text with no links.';
    const citations = extractCitations(markdown);

    assert.deepEqual(citations, []);
  });

  test('handles citations without line numbers', () => {
    const markdown = 'See [module](src/module.ts) for details.';
    const citations = extractCitations(markdown);

    assert.deepEqual(citations, ['src/module.ts']);
  });

  test('handles inline code with citations', () => {
    const markdown = 'Use `[file](path.ts)` format.';
    const citations = extractCitations(markdown);

    assert.deepEqual(citations, ['path.ts']);
  });
});

describe('addCitationFooter', () => {
  test('adds references section with citations', () => {
    const markdown = 'Check [file1](src/file1.ts) and [file2](src/file2.ts).';
    const result = addCitationFooter(markdown);

    assert.ok(result.includes('References'));
    assert.ok(result.includes('src/file1.ts'));
    assert.ok(result.includes('src/file2.ts'));
  });

  test('returns original if no citations', () => {
    const markdown = 'No citations here.';
    const result = addCitationFooter(markdown);

    assert.equal(result, markdown);
    assert.ok(!result.includes('References'));
  });

  test('numbers citations in order', () => {
    const markdown = 'See [a](a.ts), [b](b.ts), [c](c.ts).';
    const result = addCitationFooter(markdown);

    assert.ok(result.includes('1.'));
    assert.ok(result.includes('2.'));
    assert.ok(result.includes('3.'));
  });

  test('adds proper spacing before references', () => {
    const markdown = 'Content with [file](file.ts).';
    const result = addCitationFooter(markdown);

    // Should have double newline before references
    assert.ok(result.includes('\n\n## '));
  });

  test('handles markdown already ending with newlines', () => {
    const markdown = 'Content [file](file.ts)\n\n';
    const result = addCitationFooter(markdown);

    assert.ok(result.includes('References'));
  });

  test('uses code formatting for file paths', () => {
    const markdown = 'See [file](src/file.ts).';
    const result = addCitationFooter(markdown);

    assert.ok(result.includes('`src/file.ts`'));
  });
});

describe('formatErrorMessage', () => {
  test('includes error heading', () => {
    const result = formatErrorMessage('API error', 'test query');

    assert.ok(result.includes('Unable to Answer'));
  });

  test('includes the query', () => {
    const result = formatErrorMessage('error', 'how does auth work');

    assert.ok(result.includes('how does auth work'));
  });

  test('includes the error message', () => {
    const result = formatErrorMessage('Connection timeout', 'test');

    assert.ok(result.includes('Connection timeout'));
  });

  test('includes troubleshooting suggestions', () => {
    const result = formatErrorMessage('error', 'query');

    assert.ok(result.includes('Possible Solutions'));
    assert.ok(result.includes('codevault index'));
    assert.ok(result.includes('rephrasing'));
    assert.ok(result.includes('API configurations'));
  });

  test('uses markdown formatting', () => {
    const result = formatErrorMessage('error', 'query');

    // Should have headers
    assert.ok(result.includes('#'));
    // Should have numbered list
    assert.ok(result.includes('1.'));
    assert.ok(result.includes('2.'));
  });
});

describe('formatNoResultsMessage', () => {
  test('includes no results heading', () => {
    const result = formatNoResultsMessage('test query');

    assert.ok(result.includes('No Relevant Code Found'));
  });

  test('includes the query', () => {
    const result = formatNoResultsMessage('authentication middleware');

    assert.ok(result.includes('authentication middleware'));
  });

  test('shows queries attempted when provided', () => {
    const result = formatNoResultsMessage('complex query', [
      'sub query 1',
      'sub query 2',
      'sub query 3'
    ]);

    assert.ok(result.includes('Queries Attempted'));
    assert.ok(result.includes('sub query 1'));
    assert.ok(result.includes('sub query 2'));
    assert.ok(result.includes('sub query 3'));
  });

  test('does not show queries section for single query', () => {
    const result = formatNoResultsMessage('single query', ['single query']);

    // Only shows when more than 1 query
    assert.ok(!result.includes('Queries Attempted'));
  });

  test('does not show queries section when undefined', () => {
    const result = formatNoResultsMessage('query');

    assert.ok(!result.includes('Queries Attempted'));
  });

  test('includes suggestions', () => {
    const result = formatNoResultsMessage('query');

    assert.ok(result.includes('Suggestions'));
    assert.ok(result.includes('specific technical terms'));
    assert.ok(result.includes('indexed project'));
    assert.ok(result.includes('function names'));
  });

  test('uses markdown formatting', () => {
    const result = formatNoResultsMessage('query');

    // Should have headers
    assert.ok(result.includes('#'));
    // Should have numbered list
    assert.ok(result.includes('1.'));
    assert.ok(result.includes('2.'));
    assert.ok(result.includes('3.'));
    assert.ok(result.includes('4.'));
  });

  test('numbers queries in order', () => {
    const result = formatNoResultsMessage('query', ['q1', 'q2', 'q3']);

    const lines = result.split('\n');
    const queryLines = lines.filter(l => l.includes('"q'));

    assert.ok(queryLines.some(l => l.includes('1.')));
    assert.ok(queryLines.some(l => l.includes('2.')));
    assert.ok(queryLines.some(l => l.includes('3.')));
  });
});

describe('FormattingOptions', () => {
  test('includeMetadata defaults to true', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai',
      metadata: { searchType: 'hybrid' }
    };

    // Call without options
    const output = formatSynthesisResult(result);

    assert.ok(output.includes('Search Metadata'));
  });

  test('includeStats defaults to true', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    const output = formatSynthesisResult(result);

    assert.ok(output.includes('CodeVault'));
  });

  test('colorize option exists but is not used in output', () => {
    const result: SynthesisResult = {
      success: true,
      answer: 'Answer',
      query: 'test',
      chunksAnalyzed: 5,
      chatProvider: 'OpenAI-Chat',
      embeddingProvider: 'openai'
    };

    // Should not throw with colorize option
    assert.doesNotThrow(() => {
      formatSynthesisResult(result, { colorize: true });
    });
  });
});
