# Esme Learning Academy 

Esme Learning Academy is a Learning Management System (LMS) designed to deliver video-based training content, quizzes, and progress tracking. It uses **Google Sheets** as a database for easy content management and **Firebase Storage** for hosting video assets.

## 🚀 Key Features

-   **User Dashboard**: Personalized dashboard showing assigned courses, course library, and progress.
-   **Course Player**: Video player with progress tracking (tracks actual watch time).
-   **Language Support**: Automatic detection of English/Hindi content based on course titles/descriptions with a filtering system.
-   **Leaderboard**: Gamified experience showing top learners based on training hours.
-   **Quizzes**: Integrated assessment system using Google Forms/Sheets.
-   **Filtering**: Filter courses by Category, Subcategory, and Language.
-   **Admin Portal**: Separate service for uploading content and assigning courses (Internal Tool).

## 🛠️ Tech Stack

-   **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
-   **Backend**: Node.js, Express.js (v5+).
-   **Database**: Google Sheets (via Google Sheets API v4).
-   **Storage**: Firebase Storage (Video & Thumbnail hosting).
-   **Authentication**: Custom logic using Google Sheets as the user store.

## 📋 Prerequisites

Before you begin, ensure you have met the following requirements:

-   **Node.js** (v18 or higher recommended)
-   **Google Cloud Service Account** with:
    -   Google Sheets API enabled.
    -   `private_key.pem` file.
    -   Client email added as an **Editor** to your Google Sheet.
-   **Firebase Project** with:
    -   Storage bucket enabled.
    -   `firebase-admin.json` service account credentials (for Admin Server).

## ⚙️ Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/akkkshat07/Esme_academia.git
    cd Esme_academia
    ```

2.  **Install Dependencies**
    ```bash
    # Install root dependencies (Backend & Frontend Server)
    npm install

    # Install Admin Server dependencies
    cd admin-server
    npm install
    cd ..
    ```

3.  **Configuration**
    Create a `.env` file in the root directory:
    ```env
    PORT=3001
    SHEET_ID=your_google_sheet_id_here
    GOOGLE_PROJECT_ID=your_project_id
    GOOGLE_CLIENT_EMAIL=your_service_account_email
    GOOGLE_PRIVATE_KEY_ID=your_key_id
    PRIVATE_KEY_PATH=private_key.pem
    ```

    Ensure your `private_key.pem` is placed in the root directory.

4.  **Google Sheet Structure**
    The system expects a Google Sheet with the following tabs:
    -   `Users` (Name, Email, Phone, Dept, ...)
    -   `Courses` (Category, Subcategory, Topic, Title, Description, URL, Duration, Type, Thumbnail, Download)
    -   `AssignedCourses` (Email, Title, Due Date...)
    -   `Completions` (Tracking progress)
    -   `Quizzes`
    -   `Feedback`

## 🏃‍♂️ Running the Application

The project includes a helper script `dev-server.sh` to manage the development environment.

### Start All Servers
Starts the Backend API (Port 3001) and Frontend Proxy (Port 3000).
```bash
./dev-server.sh start
```
*Access the application at [http://localhost:3000](http://localhost:3000)*

### Stop Servers
```bash
./dev-server.sh stop
```

### View Status
```bash
./dev-server.sh status
```

### View Logs
```bash
./dev-server.sh logs backend
# or
./dev-server.sh logs frontend
```

## 🏗️ Project Structure

```
├── Frontend/              # Client-side code (HTML/CSS/JS)
│   ├── index.html         # Login Page
│   ├── dashboard.html     # Main Dashboard
│   ├── player.html        # Video Player
│   ├── img/               # Static assets
│   └── styles.css         # Global styles
├── server.js              # Main Backend API (Node/Express)
├── frontend-server.js     # Frontend Proxy Server
├── dev-server.sh          # Management Script
├── admin-server/          # Admin Backend (Course Uploads)
├── admin-portal/          # Admin UI
└── inspect-courses.js     # Utility to check Sheet data
```

## 🤝 Contributing

We follow a GitFlow-inspired workflow:

-   `main`: Stable production code.
-   `develop`: Integration branch for new features.

**To add a feature:**
1.  Checkout `develop`: `git checkout develop`
2.  Create your branch: `git checkout -b feature/amazing-feature`
3.  Commit changes.
4.  Push and open a Pull Request to `develop`.

## 📜 License

This project is proprietary software for internal training use.
