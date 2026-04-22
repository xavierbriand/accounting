import type { CsvParser, ParseOptions } from '@core/ports/csv-parser.js';
import type { ParseOutcome } from '@core/ingest/types.js';
import { Result } from '@core/shared/result.js';

export class NodeCsvParser implements CsvParser {
  parse(_content: string, _opts: ParseOptions): Result<ParseOutcome> {
    return Result.fail('NodeCsvParser not yet implemented');
  }
}
