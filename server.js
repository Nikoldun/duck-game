const express = require('express');
const app = express();
const PORT = 3001;

// Раздаём статические файлы из папки "public"
app.use(express.static('public'));

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
