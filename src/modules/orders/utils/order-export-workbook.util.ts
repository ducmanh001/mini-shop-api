import ExcelJS from 'exceljs';
import {
  ORDER_EXPORT_COLUMNS,
  ORDER_EXPORT_SHEET_NAME,
} from '../constants/orders.constants';
import { OrderExportRow } from '../interfaces/order-export-row.interface';

/** Build workbook thuần (không đụng DB/HTTP) — dễ unit test bằng cách đọc lại buffer qua `exceljs`. */
export async function buildOrdersWorkbook(
  rows: readonly OrderExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(ORDER_EXPORT_SHEET_NAME);
  sheet.columns = ORDER_EXPORT_COLUMNS.map((column) => ({ ...column }));
  sheet.addRows([...rows]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
