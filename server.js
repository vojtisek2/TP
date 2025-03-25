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

const app = express();
app.use(cors());
app.use(express.json());

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
  req.userId = userId;
  next();
}

// -------------------------------------------------------
// REGISTRACE (POST /api/register)
// -------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

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
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
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
      SELECT o.*, u.username 
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
      SELECT o.*, u.username
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
// Servírovat index.html na kořenové adrese
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Spuštění serveru
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
