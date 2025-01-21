require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs')


const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Настройка Multer для сохранения файлов
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Папка для сохранения файлов
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Уникальное имя файла
  },
});

const upload = multer({ storage }).single('file');
// // Подключение к PostgreSQL через Sequelize
// const sequelize = new Sequelize('Auth', 'postgres', '122224428', {
//   host: 'localhost',
//   dialect: 'postgres',
// });
const sequelize = new Sequelize(process.env.DB_NAME,process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
  });
  // Определение модели User
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true, // Поле необязательное
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true, // Поле необязательное
  },
}, {
  tableName: 'users', // Указываем имя таблицы в базе данных
  timestamps: false, // Отключаем автоматические поля createdAt и updatedAt
});
const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  image: {
    type: DataTypes.STRING, // Путь к изображению
    allowNull: true,
  },
  video: {
    type: DataTypes.STRING, // Путь к видео
    allowNull: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User, // Связь с моделью User
      key: 'id',
    },
  },
}, {
  tableName: 'posts', // Имя таблицы в базе данных
  timestamps: true, // Добавляем поля createdAt и updatedAt
});

// Связь между User и Post
User.hasMany(Post, { foreignKey: 'userId' });
Post.belongsTo(User, { foreignKey: 'userId' });

  // Определение модели Comment
const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User, // Связь с моделью User
      key: 'id',
    },
  },
  postId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Post, // Связь с моделью Post
      key: 'id',
    },
  },
}, {
  tableName: 'comments', // Имя таблицы в базе данных
  timestamps: true, // Добавляем поля createdAt и updatedAt
});
// Связи между моделями
User.hasMany(Comment, { foreignKey: 'userId' });
Post.hasMany(Comment, { foreignKey: 'postId' });
Comment.belongsTo(User, { foreignKey: 'userId' });
Comment.belongsTo(Post, { foreignKey: 'postId' })




// Синхронизация модели с базой данных
sequelize.sync()
  .then(() => {
    console.log('Модели синхронизированы с базой данных');
  })
  .catch((err) => {
    console.error('Ошибка при синхронизации моделей:', err);
  });
// МИДЛ ВАРЫ
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Получаем токен из заголовка
  if (!token) {
    return res.status(401).json({ success: false, message: 'Требуется авторизация' });
  }

  try {
    // Проверяем токен
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded; // Добавляем данные пользователя в запрос
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Неверный токен' });
  }
};
// Маршрут для регистрации
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создание пользователя
    const user = await User.create({
      email,
      password: hashedPassword,
    });

    res.status(201).json({ success: true, message: 'Пользователь зарегистрирован', userId: user.id });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
    } else {
      console.error('Ошибка при регистрации:', err);
      res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
  }
});

// Маршрут для входа
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Проверка наличия обязательных полей
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email и пароль обязательны' });
  }

  try {
    // Поиск пользователя по email
    const user = await User.findOne({ where: { email } });

    // Если пользователь не найден
    if (!user) {
      return res.status(401).json({ success: false, message: 'Пользователь с таким email не найден' });
    }

    // Сравнение хешированного пароля
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // Если пароль неверный
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Неверный пароль' });
    }

    // Создание токена
    const token = jwt.sign(
      { id: user.id, userId: user.id, email: user.email }, // Данные, которые будут храниться в токене
      process.env.SECRET_KEY, // Секретный ключ
      { expiresIn: '24h' } // Время жизни токена (например, 1 час)
    );

    // Успешный логин
    res.status(200).json({
      success: true,
      message: 'Вход выполнен успешно',
      token, // Возвращаем токен клиенту
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        gender: user.gender,
      },
    });
  } catch (err) {
    console.error('Ошибка при входе:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

app.post('/logout', async(req, res)  =>{
  res.clearCookie('token'); // Удаляем токен из куки
  res.status(200).json({ success: true, message: 'Выход выполнен успешно' });
})

// Маршрут для создания нового пользователя
app.post('/new-user', async (req, res) => {
  const { name, email, password, gender } = req.body;

  // Проверка наличия обязательных полей
  if (!name || !email || !password || !gender) {
    return res.status(400).json({ success: false, message: 'Все поля обязательны' });
  }

  try {
    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создание пользователя
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      gender,
    });

    // Успешный ответ
    res.status(201).json({
      success: true,
      message: 'Пользователь успешно создан',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        gender: user.gender,
      },
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
    } else {
      console.error('Ошибка при создании пользователя:', err);
      res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
  }
});

//МАРШРУТЫ ДЛЯ ПОСТОВ

//Создание записи
app.post('/api/posts', authenticateUser, upload, async (req, res) => {
  try {
    console.log(req.files); // Отладка: проверяем, что файлы загружены

    const { title, content } = req.body;
    const file = req.file ? req.file.path : null;
    const userId = req.user.id;

    const fileType = req.file.mimetype.startsWith('image') ? 'image' : 'video';
    const post = await Post.create({ title, content, [fileType]: file, userId });
    res.status(201).json({ success: true, post });
  } catch (err) {
    console.error('Ошибка при создании поста:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});
//Получение всех записей

app.get('/api/posts', authenticateUser, async (req, res) => {
  try {
    const posts = await Post.findAll({
      include: [
        {
          model: User, // Автор поста
          attributes: ['name'], // Выбираем только имя автора
        },
        {
          model: Comment, // Комментарии к посту
          include: [
            {
              model: User, // Автор комментария
              attributes: ['name'], // Выбираем только имя автора
            },
          ],
        },
      ],
    });

    res.status(200).json({ success: true, posts });
  } catch (err) {
    console.error('Ошибка при получении записей:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});
//Получение одной записи
app.get('/api/posts/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    const post = await Post.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] }, // Информация об авторе поста
        { model: Comment, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }, // Комментарии с информацией об авторе
      ],
    });
    if (!post) {
      return res.status(404).json({ success: false, message: 'Запись не найдена' });
    }
    res.status(200).json({ success: true, post });
  } catch (err) {
    console.error('Ошибка при получении записи:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});
// Редактирование записи

app.put('/api/posts/:id',authenticateUser,upload , async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const file = req.file;

  try {
    const post = await Post.findByPk(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Запись не найдена' });
    }

    post.title = title || post.title;
    post.content = content || post.content;

    if (file) {
      const fileType = file.mimetype.split('/')[0]; // Определяем тип файла (image или video)
      if (fileType === 'image') {
        post.image = `/uploads/${file.filename}`; // Сохраняем путь к изображению
      } else if (fileType === 'video') {
        post.video = `/uploads/${file.filename}`; // Сохраняем путь к видео
      }
    }
    await post.save();

    res.status(200).json({ success: true, message: 'Запись обновлена', post });
  } catch (err) {
    console.error('Ошибка при обновлении записи:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

//Удление записи

app.delete('/api/posts/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId; // Извлекаем userId из JWT токена

  try {
    // Находим пост по ID
    const post = await Post.findByPk(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Запись не найдена' });
    }

    // Проверяем, является ли пользователь создателем поста
    if (post.userId !== userId) {
      return res.status(403).json({ success: false, message: 'У вас нет прав на удаление этой записи' });
    }

    // Удаляем пост
    await post.destroy();
    res.status(200).json({ success: true, message: 'Запись удалена' });
  } catch (err) {
    console.error('Ошибка при удалении записи:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Комментарии(под постом)
// Создание комментария:
app.post('/api/posts/:postId/comments', authenticateUser, async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  const userId = req.user.id; // ID автора из мидлвари

  try {
    const comment = await Comment.create({ text, userId, postId });
    res.status(201).json({ success: true, message: 'Комментарий добавлен', comment });
  } catch (err) {
    console.error('Ошибка при добавлении комментария:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});
// Получение комментариев для поста:
app.get('/api/posts/:postId/comments', authenticateUser, async (req, res) => {
  const { postId } = req.params;

  try {
    const comments = await Comment.findAll({
      where: { postId },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }], // Включаем данные о пользователе
    });
    res.status(200).json({ success: true, comments });
  } catch (err) {
    console.error('Ошибка при получении комментариев:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});
//  Удаление комментария: 
app.delete('/api/comments/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // ID автора из мидлвари

  try {
    const comment = await Comment.findOne({ where: { id, userId } }); // Проверяем, что комментарий принадлежит пользователю
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Комментарий не найден или у вас нет прав на удаление' });
    }

    await comment.destroy();
    res.status(200).json({ success: true, message: 'Комментарий удален' });
  } catch (err) {
    console.error('Ошибка при удалении комментария:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});