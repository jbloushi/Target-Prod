### ⚠️ **Critical Security Warning: Exposed Keys**

**The following keys are currently committed to the repository in `.env` files and MUST be regenerated immediately upon production deployment:**

| Vulnerable Key | Location | Action Required |
| :--- | :--- | :--- |
| `DEEPSEEK_API_KEY` | `frontend/.env` | **REVOKE & REGENERATE** immediately. |
| `DHL_API_SECRET` | `backend/.env` | **REVOKE & REGENERATE** in DHL Portal. |
| `DHL_API_KEY` | `backend/.env` | **ROTATE** if possible. |
| `JWT_SECRET` | `backend/.env` | **GENERATE NEW** random secret for production. |
| `MONGO_ROOT_PASSWORD` | `root/.env` | **CHANGE** to a strong unique password. |
| `GOOGLE_MAPS_API_KEY` | `frontend/.env`, `backend/.env` | Ensure restricting to production domains only. |

**DO NOT USE THESE COMMITTED VALUES IN PRODUCTION.**

## Environment: Production (aaPanel VPS)

### Backend (`/backend/.env`)

| Variable | Description | Source/Action |
| :--- | :--- | :--- |
| `MONGO_URI` | Connection string for MongoDB | Set in `docker-compose.yml` or aaPanel env. Should use internal docker network alias (e.g. `mongodb`). |
| `MONGO_ROOT_PASSWORD` | Root password for MongoDB | Generate a strong password. |
| `JWT_SECRET` | Secret key for signing JWT tokens | Generate a strong random string (e.g. `openssl rand -base64 32`). |
| `DHL_API_KEY` | API Key for DHL Express | Obtain from DHL Developer Portal (Production App). |
| `DHL_API_SECRET` | API Secret for DHL Express | Obtain from DHL Developer Portal (Production App). |
| `DHL_ACCOUNT_NUMBER` | DHL Account Number | Your DHL Account Number (Production). |
| `GOOGLE_MAPS_API_KEY` | Google Maps API Key | Obtain from Google Cloud Console. Ensure restrictions are set for production domain. |

### Frontend (`/frontend/.env` built into static files)

| Variable | Description | Source/Action |
| :--- | :--- | :--- |
| `REACT_APP_API_URL` | URL of the backend API | Set to your production domain (e.g. `https://3pl.mawthook.io/api`). |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Google Maps API Key | Same as backend, or a separate key with domain restrictions for frontend. |
| `REACT_APP_MAPBOX_TOKEN` | Mapbox Token (if used) | Obtain from Mapbox account. |

### Docker (`.env` in root)

| Variable | Description | Source/Action |
| :--- | :--- | :--- |
| `MONGO_ROOT_PASSWORD` | Root password for MongoDB container | Must match `MONGO_ROOT_PASSWORD` in backend env. |
| `MONGO_INITDB_ROOT_PASSWORD` |  | Same as above. |

## Action Items

1.  SSH into your VPS.
2.  Navigate to the project root: `/www/wwwroot/3pl.mawthook.io`.
3.  Create/Update the `.env` file in the root directory for Docker Compose.
4.  Create/Update the `.env` file in the `backend/` directory.
5.  Rebuild the frontend with the correct `REACT_APP_API_URL` if not using Docker to serve it (check `deploy.sh`).
6.  Restart containers: `docker-compose up -d --build`.
