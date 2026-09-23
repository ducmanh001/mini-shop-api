import ExcelJS from 'exceljs';
import { ORDER_EXPORT_COLUMNS } from '../constants/orders.constants';
import { OrderExportRow } from '../interfaces/order-export-row.interface';
import { buildOrdersWorkbook } from './order-export-workbook.util';

describe('buildOrdersWorkbook', () => {
  function sampleRow(overrides: Partial<OrderExportRow> = {}): OrderExportRow {
    return {
      id: 'order-1',
      status: 'COMPLETED',
      totalVnd: '250000',
      recipientName: 'Nguyen Van A',
      phone: '0901234567',
      createdAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-05T00:00:00.000Z',
      ...overrides,
    };
  }

  async function readBackFirstSheet(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook.worksheets[0];
  }

  it('writes a header row matching ORDER_EXPORT_COLUMNS in order', async () => {
    const buffer = await buildOrdersWorkbook([sampleRow()]);

    const sheet = await readBackFirstSheet(buffer);
    const headerRow = sheet.getRow(1).values as unknown[];
    // exceljs 1-indexes columns and puts an empty slot at index 0.
    const headers = headerRow.slice(1);
    expect(headers).toEqual(
      ORDER_EXPORT_COLUMNS.map((column) => column.header),
    );
  });

  it('writes one data row per input row, in the given order', async () => {
    const rows = [
      sampleRow({ id: 'order-1' }),
      sampleRow({ id: 'order-2', status: 'PENDING', completedAt: '' }),
    ];
    // Vị trí cột theo đúng thứ tự ORDER_EXPORT_COLUMNS — `column.key` chỉ là tiện ích in-memory
    // của exceljs khi build workbook, KHÔNG được ghi vào file .xlsx thật, nên đọc lại từ buffer
    // (round-trip qua `xlsx.load`) phải tra theo vị trí (1-indexed), không tra được theo key.
    const idColumn = ORDER_EXPORT_COLUMNS.findIndex((c) => c.key === 'id') + 1;
    const statusColumn =
      ORDER_EXPORT_COLUMNS.findIndex((c) => c.key === 'status') + 1;

    const buffer = await buildOrdersWorkbook(rows);

    const sheet = await readBackFirstSheet(buffer);
    expect(sheet.rowCount).toBe(3); // header + 2 data rows
    expect(sheet.getRow(2).getCell(idColumn).value).toBe('order-1');
    expect(sheet.getRow(3).getCell(idColumn).value).toBe('order-2');
    expect(sheet.getRow(3).getCell(statusColumn).value).toBe('PENDING');
  });

  it('produces a sheet with no data rows (header only) for an empty input', async () => {
    const buffer = await buildOrdersWorkbook([]);

    const sheet = await readBackFirstSheet(buffer);
    expect(sheet.rowCount).toBe(1);
  });
});
