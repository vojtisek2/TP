/**
 * server.js
 *
 * Spustíte příkazem:
 *    npm install
 *    npm start
 *
 * Aplikace poběží na adrese:
 *    http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Mapování uživatelů na jejich socket.id
const userSockets = {};

io.on('connection', (socket) => {
  socket.on('login', ({ userId }) => {
    userSockets[userId] = socket.id;
  });

  socket.on('chatMessage', async ({ senderId, recipientId, content, senderUsername }) => {
    // Uložení do DB
    await connection.query(
      'INSERT INTO messages (sender_id, recipient_id, content, created_at) VALUES (?, ?, ?, NOW())',
      [senderId, recipientId, content]
    );
    // Odeslání zprávy příjemci (pokud je online)
    if (userSockets[recipientId]) {
      io.to(userSockets[recipientId]).emit('chatMessage', {
        senderId, recipientId, content, created_at: new Date(), sender_username: senderUsername
      });
    }
    // Odeslání zpět odesílateli (pro zobrazení vlastní zprávy)
    socket.emit('chatMessage', {
      senderId, recipientId, content, created_at: new Date(), sender_username: senderUsername
    });
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of Object.entries(userSockets)) {
      if (sid === socket.id) delete userSockets[uid];
    }
  });
});

// 1) Nastavení úložiště pro nahrané soubory (Multer)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads'); // složka, kam se uloží
  },
  filename: function (req, file, cb) {
    // Pojmenujeme soubor nějak jednoznačně
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Extrahujeme příponu
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// 2) Servírování statických souborů z adresáře "public" a také z "uploads"
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Nastavení připojení k databázi MySQL (změňte dle potřeby)
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'vojtisek480', // doplňte vaše heslo, pokud je
  database: 'bazar_obleceni'
};

let connection;
(async function initDB() {
  try {
    // Vytvoříme "connection pool"
    connection = await mysql.createPool(dbConfig);
    console.log('Připojeno k databázi MySQL');
  } catch (error) {
    console.error('Chyba při připojování k databázi:', error);
    process.exit(1);
  }
})();

// Pomocná funkce pro autentizaci
function authenticateUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ message: 'Nejste přihlášeni.' });
  }
  req.userId = parseInt(userId, 10); // zajistí číslo
  next();
}

// -------------------------------------------------------
// REGISTRACE (POST /api/register)
// -------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, telephone, email } = req.body;

    // Ověříme, zda uživatel již neexistuje
    const [rows] = await connection.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    if (rows.length > 0) {
      return res.status(400).json({ message: 'Uživatel už existuje.' });
    }

    // Zahashujeme heslo
    const hashedPassword = await bcrypt.hash(password, 10);

    // Vložíme nového uživatele do DB
    const [result] = await connection.query(
      'INSERT INTO users (username, password, telephone, email) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, telephone || '', email || '']
    );
    const newUserId = result.insertId;

    // Po registraci rovnou vrátíme userId a username (automat. přihlášení)
    return res.status(201).json({
      message: 'Registrace proběhla úspěšně.',
      userId: newUserId,
      username
    });
  } catch (error) {
    console.error('Chyba při registraci uživatele:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// PŘIHLÁŠENÍ (POST /api/login)
// -------------------------------------------------------
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Najdeme uživatele
    const [rows] = await connection.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Neplatné přihlašovací údaje.' });
    }

    const user = rows[0];
    // Porovnáme heslo s hashem
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Neplatné přihlašovací údaje.' });
    }

    // Vrátíme userId + username
    return res.json({
      message: 'Přihlášení proběhlo úspěšně.',
      userId: user.id,
      username: user.username
    });
  } catch (error) {
    console.error('Chyba při přihlašování:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// ZÍSKAT VŠECHNY NABÍDKY (GET /api/offers) - pro "Domů"
// -------------------------------------------------------
app.get('/api/offers', async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT o.*, o.user_id, u.username, u.telephone, u.email
      FROM offers o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Chyba při čtení nabídek:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// ZÍSKAT MOJE NABÍDKY (GET /api/my-offers) - "Můj účet"
// -------------------------------------------------------
app.get('/api/my-offers', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const [rows] = await connection.query(`
      SELECT o.*, o.user_id, u.username
      FROM offers o
      JOIN users u ON o.user_id = u.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `, [userId]);

    return res.json(rows);
  } catch (error) {
    console.error('Chyba při čtení mých nabídek:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// VYTVOŘIT NOVOU NABÍDKU (POST /api/offers) - s nahráváním fotky
// -------------------------------------------------------
app.post(
  '/api/offers',
  authenticateUser,
  upload.single('image'),  // Multer zpracuje pole "image"
  async (req, res) => {
    try {
      const userId = req.userId;
      const {
        title,
        size,
        color,
        item_condition,
        price,
        description,
        brand
      } = req.body;

      if (!title || !price) {
        return res.status(400).json({ message: 'Chybí název nebo cena.' });
      }

      // Pokud existuje soubor, uložíme jeho cestu do DB (např. "/uploads/xyz.jpg")
      let imagePath = '';
      if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
      }

      await connection.query(
        `INSERT INTO offers
         (title, size, color, item_condition, price, image, description, brand, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, size, color, item_condition, price, imagePath, description, brand, userId]
      );

      return res.status(201).json({ message: 'Nabídka přidána.' });
    } catch (error) {
      console.error('Chyba při vytváření nabídky:', error);
      return res.status(500).json({ message: 'Chyba serveru.' });
    }
  }
);

// -------------------------------------------------------
// ÚPRAVA NABÍDKY (PUT /api/offers/:id) - s možným nahráním nové fotky
// -------------------------------------------------------
app.put(
  '/api/offers/:id',
  authenticateUser,
  upload.single('image'),
  async (req, res) => {
    try {
      const userId = req.userId;
      const offerId = req.params.id;
      const {
        title,
        size,
        color,
        item_condition,
        price,
        description,
        brand
      } = req.body;

      // Zjistíme, zda nabídka existuje a patří tomuto uživateli
      const [rows] = await connection.query('SELECT * FROM offers WHERE id = ?', [offerId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Nabídka neexistuje.' });
      }
      const offer = rows[0];
      if (offer.user_id != userId) {
        return res.status(403).json({ message: 'Nemáte právo upravit tuto nabídku.' });
      }

      let imagePath = offer.image; // Původní cesta
      // Pokud teď uživatel nahrál novou fotku, přepíšeme
      if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
      }

      await connection.query(
        `UPDATE offers
         SET title = ?, size = ?, color = ?, item_condition = ?, price = ?, image = ?, description = ?, brand = ?
         WHERE id = ?`,
        [title, size, color, item_condition, price, imagePath, description, brand, offerId]
      );

      return res.json({ message: 'Nabídka upravena.' });
    } catch (error) {
      console.error('Chyba při úpravě nabídky:', error);
      return res.status(500).json({ message: 'Chyba serveru.' });
    }
  }
);

// -------------------------------------------------------
// SMAZÁNÍ NABÍDKY (DELETE /api/offers/:id) - pouze autor
// -------------------------------------------------------
app.delete('/api/offers/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const offerId = req.params.id;

    // Zkontrolujeme, zda nabídka patří tomuto uživateli
    const [rows] = await connection.query('SELECT * FROM offers WHERE id = ?', [offerId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nabídka neexistuje.' });
    }
    const offer = rows[0];
    if (offer.user_id != userId) {
      return res.status(403).json({ message: 'Nemáte právo smazat tuto nabídku.' });
    }

    await connection.query('DELETE FROM offers WHERE id = ?', [offerId]);
    return res.json({ message: 'Nabídka smazána.' });
  } catch (error) {
    console.error('Chyba při mazání nabídky:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// ZÍSKAT KONTAKTNÍ ÚDAJE UŽIVATELE (GET /api/user/:id)
// -------------------------------------------------------
app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const [rows] = await connection.query('SELECT username, telephone, email FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Uživatel nenalezen.' });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error('Chyba při získávání kontaktu:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// CHAT ENDPOINTS
// -------------------------------------------------------
// Vytvoření nové zprávy
app.post('/api/messages', authenticateUser, async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const senderId = req.userId;
    if (!recipientId || !content) {
      return res.status(400).json({ message: 'Chybí příjemce nebo obsah.' });
    }
    await connection.query(
      'INSERT INTO messages (sender_id, recipient_id, content, created_at) VALUES (?, ?, ?, NOW())',
      [senderId, parseInt(recipientId, 10), content]
    );
    return res.status(201).json({ message: 'Zpráva odeslána.' });
  } catch (error) {
    console.error('Chyba při odesílání zprávy:', error, req.body);
    return res.status(500).json({ message: 'Chyba serveru.', error: error.message, body: req.body });
  }
});

// Získání všech konverzací pro uživatele
app.get('/api/messages/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    // Vrátí poslední zprávu z každého vlákna, kde je uživatel účastníkem
    const [rows] = await connection.query(`
      SELECT m.*, u1.username AS sender_username, u2.username AS recipient_username
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE m.sender_id = ? OR m.recipient_id = ?
      ORDER BY m.created_at DESC
    `, [userId, userId]);
    return res.json(rows);
  } catch (error) {
    console.error('Chyba při načítání konverzací:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// Získání zpráv mezi dvěma uživateli (vlákno)
app.get('/api/messages/thread/:userId1/:userId2', authenticateUser, async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    // Ověření, že aktuální uživatel je jedním z účastníků
    if (req.userId != userId1 && req.userId != userId2) {
      return res.status(403).json({ message: 'Přístup odepřen.' });
    }
    const [rows] = await connection.query(
      `SELECT m.*, u1.username AS sender_username, u2.username AS recipient_username
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.recipient_id = u2.id
       WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.created_at ASC`,
      [userId1, userId2, userId2, userId1]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Chyba při načítání vlákna:', error);
    return res.status(500).json({ message: 'Chyba serveru.' });
  }
});

// -------------------------------------------------------
// Servírovat index.html na kořenové adrese
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Spuštění serveru
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
