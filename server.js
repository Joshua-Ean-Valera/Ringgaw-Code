const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'ojt_records.db');

function to12HourFormat(timeValue) {
    if (!timeValue) return null;

    const trimmedTime = String(timeValue).trim();
    if (!trimmedTime) return null;

    const alreadyTwelveHour = /^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i;
    if (alreadyTwelveHour.test(trimmedTime)) {
        const match = trimmedTime.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
        return `${parseInt(match[1], 10)}:${match[2]} ${match[3].toUpperCase()}`;
    }

    const twentyFourHour = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!twentyFourHour.test(trimmedTime)) {
        return trimmedTime;
    }

    const [hourText, minuteText] = trimmedTime.split(':');
    const hour = parseInt(hourText, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = (hour % 12) || 12;

    return `${hour12}:${minuteText} ${suffix}`;
}

function parseTimeToMinutes(timeValue) {
    if (!timeValue) return null;

    const trimmedTime = String(timeValue).trim();
    if (!trimmedTime) return null;

    const twentyFourHour = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const twelveHour = /^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i;

    if (twentyFourHour.test(trimmedTime)) {
        const [hourText, minuteText] = trimmedTime.split(':');
        return parseInt(hourText, 10) * 60 + parseInt(minuteText, 10);
    }

    if (twelveHour.test(trimmedTime)) {
        const [, hourText, minuteText, suffix] = trimmedTime.match(twelveHour);
        const hour = parseInt(hourText, 10) % 12;
        const hour24 = suffix.toUpperCase() === 'PM' ? hour + 12 : hour;
        return hour24 * 60 + parseInt(minuteText, 10);
    }

    return null;
}

function calculateHoursWithinWindow(timeIn, timeOut, windowStart, windowEnd) {
    const inMinutesRaw = parseTimeToMinutes(timeIn);
    const outMinutesRaw = parseTimeToMinutes(timeOut);

    if (inMinutesRaw === null || outMinutesRaw === null) {
        return 0;
    }

    let inMinutes = inMinutesRaw;
    let outMinutes = outMinutesRaw;

    if (outMinutes < inMinutes) {
        outMinutes += 24 * 60;
    }

    const effectiveStart = Math.max(inMinutes, windowStart);
    const effectiveEnd = Math.min(outMinutes, windowEnd);

    if (effectiveEnd <= effectiveStart) {
        return 0;
    }

    return (effectiveEnd - effectiveStart) / 60;
}

function computeClampedHours(morningIn, morningOut, afternoonIn, afternoonOut) {
    const morningHours = calculateHoursWithinWindow(morningIn, morningOut, 8 * 60, 12 * 60);
    const afternoonHours = calculateHoursWithinWindow(afternoonIn, afternoonOut, 13 * 60, 17 * 60);
    const totalHours = morningHours + afternoonHours;

    return {
        morningHours: parseFloat(morningHours.toFixed(2)),
        afternoonHours: parseFloat(afternoonHours.toFixed(2)),
        totalHours: parseFloat(totalHours.toFixed(2))
    };
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Database setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database at:', DB_PATH);
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            morningIn TEXT,
            morningOut TEXT,
            morningHours REAL DEFAULT 0,
            afternoonIn TEXT,
            afternoonOut TEXT,
            afternoonHours REAL DEFAULT 0,
            totalHours REAL DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err);
        } else {
            console.log('Database table initialized successfully');
            migrateExistingTimesTo12Hour();
            recalculateExistingHours();
        }
    });
}

function migrateExistingTimesTo12Hour() {
    db.all('SELECT id, morningIn, morningOut, afternoonIn, afternoonOut FROM records', (err, rows) => {
        if (err) {
            console.error('Error reading records for migration:', err);
            return;
        }

        if (!rows || rows.length === 0) {
            return;
        }

        rows.forEach((row) => {
            const nextMorningIn = to12HourFormat(row.morningIn);
            const nextMorningOut = to12HourFormat(row.morningOut);
            const nextAfternoonIn = to12HourFormat(row.afternoonIn);
            const nextAfternoonOut = to12HourFormat(row.afternoonOut);

            const hasChanges =
                nextMorningIn !== row.morningIn ||
                nextMorningOut !== row.morningOut ||
                nextAfternoonIn !== row.afternoonIn ||
                nextAfternoonOut !== row.afternoonOut;

            if (!hasChanges) {
                return;
            }

            db.run(
                `
                    UPDATE records
                    SET morningIn = ?, morningOut = ?, afternoonIn = ?, afternoonOut = ?
                    WHERE id = ?
                `,
                [nextMorningIn, nextMorningOut, nextAfternoonIn, nextAfternoonOut, row.id],
                (updateErr) => {
                    if (updateErr) {
                        console.error(`Error migrating record ${row.id}:`, updateErr);
                    }
                }
            );
        });
    });
}

function recalculateExistingHours() {
    db.all('SELECT id, morningIn, morningOut, afternoonIn, afternoonOut, morningHours, afternoonHours, totalHours FROM records', (err, rows) => {
        if (err) {
            console.error('Error reading records for hour recalculation:', err);
            return;
        }

        if (!rows || rows.length === 0) {
            return;
        }

        rows.forEach((row) => {
            const recalculated = computeClampedHours(row.morningIn, row.morningOut, row.afternoonIn, row.afternoonOut);

            const hasChanges =
                recalculated.morningHours !== row.morningHours ||
                recalculated.afternoonHours !== row.afternoonHours ||
                recalculated.totalHours !== row.totalHours;

            if (!hasChanges) {
                return;
            }

            db.run(
                `
                    UPDATE records
                    SET morningHours = ?, afternoonHours = ?, totalHours = ?
                    WHERE id = ?
                `,
                [recalculated.morningHours, recalculated.afternoonHours, recalculated.totalHours, row.id],
                (updateErr) => {
                    if (updateErr) {
                        console.error(`Error recalculating hours for record ${row.id}:`, updateErr);
                    }
                }
            );
        });
    });
}

// API Routes

// Get all records
app.get('/api/records', (req, res) => {
    db.all('SELECT * FROM records ORDER BY date DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// Add a new record
app.post('/api/records', (req, res) => {
    const { date, morningIn, morningOut, afternoonIn, afternoonOut } = req.body;
    const formattedMorningIn = to12HourFormat(morningIn);
    const formattedMorningOut = to12HourFormat(morningOut);
    const formattedAfternoonIn = to12HourFormat(afternoonIn);
    const formattedAfternoonOut = to12HourFormat(afternoonOut);
    const recalculated = computeClampedHours(formattedMorningIn, formattedMorningOut, formattedAfternoonIn, formattedAfternoonOut);

    const query = `
        INSERT INTO records (date, morningIn, morningOut, morningHours, afternoonIn, afternoonOut, afternoonHours, totalHours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [date, formattedMorningIn, formattedMorningOut, recalculated.morningHours, formattedAfternoonIn, formattedAfternoonOut, recalculated.afternoonHours, recalculated.totalHours], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(409).json({ error: 'A record for this date already exists. Please update or delete it first.' });
            } else {
                res.status(500).json({ error: err.message });
            }
        } else {
            res.json({ id: this.lastID, date, morningIn: formattedMorningIn, morningOut: formattedMorningOut, morningHours: recalculated.morningHours, afternoonIn: formattedAfternoonIn, afternoonOut: formattedAfternoonOut, afternoonHours: recalculated.afternoonHours, totalHours: recalculated.totalHours });
        }
    });
});

// Update a record
app.put('/api/records/:date', (req, res) => {
    const { date } = req.params;
    const { morningIn, morningOut, afternoonIn, afternoonOut } = req.body;
    const formattedMorningIn = to12HourFormat(morningIn);
    const formattedMorningOut = to12HourFormat(morningOut);
    const formattedAfternoonIn = to12HourFormat(afternoonIn);
    const formattedAfternoonOut = to12HourFormat(afternoonOut);
    const recalculated = computeClampedHours(formattedMorningIn, formattedMorningOut, formattedAfternoonIn, formattedAfternoonOut);

    const query = `
        UPDATE records 
        SET morningIn = ?, morningOut = ?, morningHours = ?, afternoonIn = ?, afternoonOut = ?, afternoonHours = ?, totalHours = ?
        WHERE date = ?
    `;

    db.run(query, [formattedMorningIn, formattedMorningOut, recalculated.morningHours, formattedAfternoonIn, formattedAfternoonOut, recalculated.afternoonHours, recalculated.totalHours, date], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ date, morningIn: formattedMorningIn, morningOut: formattedMorningOut, morningHours: recalculated.morningHours, afternoonIn: formattedAfternoonIn, afternoonOut: formattedAfternoonOut, afternoonHours: recalculated.afternoonHours, totalHours: recalculated.totalHours });
        }
    });
});

// Delete a record
app.delete('/api/records/:date', (req, res) => {
    const { date } = req.params;

    db.run('DELETE FROM records WHERE date = ?', [date], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: 'Record deleted successfully' });
        }
    });
});

// Delete all records
app.delete('/api/records', (req, res) => {
    db.run('DELETE FROM records', function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: 'All records deleted successfully' });
        }
    });
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ojt_dtr_calculator.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`OJT DTR Calculator server running at http://localhost:${PORT}`);
    console.log(`Database file: ${DB_PATH}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});
