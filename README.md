# 杰西亚费用监控系统 - 后端

Node.js + Express 后端API，提供费用数据的增删改查和权限隔离。

## 部署到 Render

1. 将此仓库推送到 GitHub
2. 登录 [Render.com](https://render.com)（用GitHub登录）
3. 点击 "New +" → "Web Service"
4. 连接此GitHub仓库
5. 配置：
   - **Name**: jsy-expense-api
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
6. 点击 "Create Web Service"
7. 部署完成后，复制生成的URL（如 `https://jsy-expense-api.onrender.com`）

## 环境变量（可选）

无需配置环境变量，所有数据存储在 `db.json` 文件中。

## 本地开发

```bash
cd backend
npm install
node server.js
# 访问 http://localhost:3000
```

## API 端点

- `POST /api/auth/admin-login` - 管理员登录
- `POST /api/auth/dept-login` - 部门登录
- `GET /api/actuals` - 获取实际数据（带权限过滤）
- `GET /api/budgets` - 获取预算数据（带权限过滤）
- `POST /api/actuals/import` - 导入实际数据（仅管理员）
- `POST /api/budgets/import` - 导入预算数据（仅管理员）
- `GET /api/users` - 获取用户列表（仅管理员）
- `POST /api/users` - 创建用户（仅管理员）
- `DELETE /api/users/:id` - 删除用户（仅管理员）
- `GET /api/settings` - 获取设置
- `POST /api/settings` - 保存设置（仅管理员）

## 默认账号

- 管理员：`admin` / `jsy2026`
- 部门账号：见 `db.json` 中的 users 数组，默认密码 `jsy1234`
