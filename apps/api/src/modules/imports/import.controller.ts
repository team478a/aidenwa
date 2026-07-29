import type { FastifyRequest } from 'fastify';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { neutralizeCsvFormula } from '@sales-ai/shared/stage2';
import type { ImportEnvironment } from './import.types.js';

type UploadError = { status: number; code: string; message: string };
type UploadResult =
  | { error: UploadError }
  | {
      fileName: string;
      encoding: string;
      records: Record<string, string>[];
      headers: string[];
    };

export async function parseImportUpload(
  request: FastifyRequest,
  env: ImportEnvironment,
): Promise<UploadResult> {
  const file = await request.file();
  if (!file || !file.filename.toLowerCase().endsWith('.csv'))
    return {
      error: { status: 400, code: 'INVALID_FILE', message: 'CSVファイルを選択してください' },
    };
  const buffer = await file.toBuffer();
  if (buffer.length > env.CSV_MAX_BYTES)
    return {
      error: { status: 413, code: 'FILE_TOO_LARGE', message: 'ファイルサイズ上限を超えています' },
    };
  const encoding = String(
    file.fields.encoding && 'value' in file.fields.encoding ? file.fields.encoding.value : 'utf8',
  ).toLowerCase();
  let text: string;
  try {
    text =
      encoding === 'cp932' || encoding === 'shift_jis'
        ? iconv.decode(buffer, 'cp932')
        : buffer.toString('utf8').replace(/^\uFEFF/u, '');
  } catch {
    return {
      error: { status: 400, code: 'ENCODING_ERROR', message: '文字コードを変換できません' },
    };
  }
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: false,
      bom: true,
      trim: true,
    });
  } catch {
    return {
      error: { status: 400, code: 'CSV_PARSE_ERROR', message: 'CSV形式を解析できません' },
    };
  }
  if (records.length > env.CSV_MAX_ROWS)
    return {
      error: { status: 413, code: 'TOO_MANY_ROWS', message: 'CSV行数上限を超えています' },
    };
  return {
    fileName: file.filename.replace(/[\r\n]/gu, '_'),
    encoding,
    records: records.map(sanitizeCsvRecord),
    headers: Object.keys(records[0] ?? {}),
  };
}

function sanitizeCsvRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      neutralizeCsvFormula(key),
      neutralizeCsvFormula(String(value)),
    ]),
  );
}
