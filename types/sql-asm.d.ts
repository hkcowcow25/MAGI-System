declare module "sql.js/dist/sql-asm.js" {
  import type { SqlJsStatic } from "sql.js";
  type InitSqlJs = (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<SqlJsStatic>;
  const initSqlJs: InitSqlJs;
  export default initSqlJs;
}
