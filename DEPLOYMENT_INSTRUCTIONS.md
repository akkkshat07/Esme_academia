# Ubuntu Deployment Instructions

Since this repository ignores sensitive files (like keys and environment variables) for security, you need to perform a few extra steps when deploying to your Ubuntu server.

## 1. Prerequisites on Ubuntu server
Ensure you have Node.js and npm installed:
```bash
sudo apt update
sudo apt install nodejs npm
# Install PM2 for process management
sudo npm install -g pm2
```

## 2. Get the Code
Download the zip or clone the repo:
```bash
git clone https://github.com/akkkshat07/Esme_academia.git
cd Esme_academia
git checkout develop
```

## 3. Transfer Sensitive Files (CRITICAL)
The following files are **NOT** in the GitHub repository. You must upload them manually from your local PC to the `Esme_academia/` folder on the server (using SCP, FileZilla, etc.):

1. `.env` (Found in project root)
2. `private_key.pem` (Found in project root)
3. `admin-server/private_key.pem` (If applicable)
4. `admin-server/firebase-admin.json` (If applicable)

## 4. Install Dependencies
Install dependencies for the root and sub-folders:

```bash
# Root dependencies
npm install

# Admin Server dependencies
cd admin-server
npm install
cd ..
```

## 5. Startup with PM2
Use PM2 to keep your servers running in the background.

```bash
# Start Frontend Server (Port 3000)
pm2 start frontend-server.js --name "frontend"

# Start LMS Backend (Port 3001)
pm2 start server.js --name "backend-lms"

# Start AI/Admin Server (Port 3002)
cd admin-server
pm2 start adminServer.js --name "backend-ai"
cd ..

# Save the process list so they restart on reboot
pm2 save
pm2 startup
```

## 6. Verification
Check if everything is running:
```bash
pm2 status
pm2 logs
```
