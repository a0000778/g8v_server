# G8V 電視牆 伺服端
## 相關資源
- 用戶端：https://github.com/a0000778/g8v
- hackfoldr：http://hackfoldr.org/G8VTV/

## API 列表
### 模組 getsourceid
以 `POST` 方法向 `/getSourceId` 發送請求，取得特定來源相關 ID

POST 資料：
- `source` 資料來源

#### 支援來源列表
- ustream：於欄位 `path` 存入 UStream 的頁面路徑 `/` 以後的資料即可

### 模組 mapPoint
#### WebSocket
以 `mapPoint` 協定發起連線，依連線路徑決定地圖，所有的資料傳輸皆為 JSON 格式。操作類型由資料欄位 `action` 決定

操作類型列表：
- `move` 新增或變更標記點，伺服端及用戶端皆可接受，需要以下欄位：
    - `(String) name` 標記點名稱
    - `(Array) pos` 長度為2的陣列，分別表示XY兩軸，為浮點數
    - `(String) module` 模組名稱，參考用戶端模組列表
    - `(Array) args` 模組執行參數，參考用戶端相關模組的 `load` 方法
- `delete` 刪除標記點，伺服端及用戶端皆可接受，需要以下欄位：
    - `(String) name` 標記點名稱
- `viewAll` 伺服器發送標記點完畢，用戶端可依當前列表自動調整至合適的顯示區域，僅用戶端接受

#### HTTP
以 `POST` 方法向 `/mapPoint/{地圖名稱}` 發送請求，新增、變更或刪除標記點，
操作類型由 `action` 決定，需要以下POST欄位：
- `move` 新增或變更標記點，需要以下欄位：
    - `name` 標記點名稱
    - `pos` 表示XY兩軸，以 `,` 分隔，為浮點數
    - `module` 模組名稱，參考用戶端模組列表
    - `args` 模組執行參數，JSON 格式，參考用戶端相關模組的 `load` 方法
- `delete` 刪除標記點，需要以下欄位：
    - `name` 標記點名稱

## 模組執行需求
### 模組 getsourceid
- 可接收 HTTP 請求
- 可向特定網站發起 HTTP 請求

### 模組 mapPoint
- 可接收 HTTP 請求
- 可建立 WebSocket 連線
- 需要 MySQL 資料庫