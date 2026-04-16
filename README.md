# OJT DTR Calculator with SQLite Database

A web-based Daily Time Record calculator that stores all your OJT records in a persistent SQLite database.

## Features
- ✅ Persistent SQLite Database (`ojt_records.db`)
- 📊 Real-time statistics and progress tracking
- 📈 Visual progress bar toward 162-hour goal
- 📝 Complete time records with morning and afternoon shifts
- 💾 Automatic data persistence
- 🗑️ Delete individual or all records
- 🎯 Remaining hours, days, and weeks calculation

## Installation & Setup

### Prerequisites
- Node.js and npm installed on your computer

### Step 1: Install Dependencies
Open PowerShell/Command Prompt in the project folder and run:
```bash
npm install
```

This will install:
- Express (web server)
- SQLite3 (database)
- CORS (for cross-origin requests)
- Body-Parser (for parsing JSON)

### Step 2: Start the Server
Run the following command:
```bash
npm start
```

You should see:
```
OJT DTR Calculator server running at http://localhost:3000
Database file: [path]\ojt_records.db
Connected to SQLite database at: [path]\ojt_records.db
Database table initialized successfully
```

### Step 3: Open the App
Open your web browser and go to:
```
http://localhost:3000
```

## How to Use
1. **Add a Record**: 
   - Select a date
   - Enter morning time in/out
   - Enter afternoon time in/out
   - Click "Add Record"

2. **View Progress**:
   - Total hours worked
   - Remaining hours to reach 162
   - Estimated days/weeks left (8 hours/day)

3. **Delete Records**:
   - Click "Delete" button on any record to remove it
   - Click "Clear All" to delete all records (careful!)

## Database

The SQLite database file (`ojt_records.db`) is created automatically in the project folder. It contains:
- Date of the record
- Morning time in/out and hours
- Afternoon time in/out and hours
- Total daily hours
- Creation timestamp

### Access the Database Directly
You can view/edit the database using SQLite viewers:
- **SQLite Browser**: Free tool at https://sqlitebrowser.org/
- **VS Code Extension**: "SQLite Viewer" extension

## Important Notes
- The server must be running for the app to work
- All records are saved to `ojt_records.db` - they won't be lost!
- If you accidentally delete records, back up your `ojt_records.db` file regularly
- Only one record per date is allowed (update the existing one if needed)

## Troubleshooting

**"Cannot connect to server" error:**
- Make sure the server is running (npm start)
- Check that you're accessing http://localhost:3000
- Check that port 3000 is not being used by another application

**"A record for this date already exists" error:**
- You can only have one entry per date
- Delete the old entry first if you need to re-enter data

**Database file not created:**
- Run `npm install` first to ensure all dependencies are installed
- Check folder permissions
- Try restarting the server

## Stopping the Server
Press `Ctrl + C` in the terminal to stop the server.
