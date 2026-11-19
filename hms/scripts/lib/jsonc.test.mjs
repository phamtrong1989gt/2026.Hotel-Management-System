// Test cho scripts/lib/jsonc.mjs — đọc JSON có chú thích (appsettings, launchSettings, workspace.json viết tay). Chạy: node --test scripts/lib/jsonc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc, stripJsonc } from './jsonc.mjs';

test('bỏ chú thích dòng và chú thích khối, giữ nguyên nội dung trong chuỗi (kể cả «//» và «/*»)', () => {
  const text = '// đầu\n{ /* khối */ "u": "http://h:5000/a", "g": "/* giữ */", "n": 1 // cuối dòng\n}\n';
  assert.deepEqual(parseJsonc(text), { u: 'http://h:5000/a', g: '/* giữ */', n: 1 });
});

test('bỏ dấu phẩy thừa trước } và ] nhưng KHÔNG đụng chuỗi chứa «, }»', () => {
  assert.deepEqual(parseJsonc('{ "a": [1, 2, ], "b": "x, }", "c": { "d": 1, }, }'), { a: [1, 2], b: 'x, }', c: { d: 1 } });
});

test('chịu BOM đầu tệp và chuỗi có dấu \\" thoát', () => {
  assert.deepEqual(parseJsonc('﻿{ "a": "q\\"//r" }'), { a: 'q"//r' });
  assert.equal(stripJsonc('﻿{}'), '{}');
});

test('JSON hỏng sau khi bỏ chú thích ⇒ ném SyntaxError (không nuốt lặng lẽ)', () => {
  assert.throws(() => parseJsonc('{ "a": }'), SyntaxError);
});
