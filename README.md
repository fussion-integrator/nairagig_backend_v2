# NairaGig Backend API

Enterprise-grade Node.js/TypeScript backend for the NairaGig freelancing platform.

## Features

- **Enterprise Architecture**: Clean, scalable, and maintainable code structure
- **TypeScript**: Full type safety and modern JavaScript features
- **PostgreSQL**: Robust relational database with Prisma ORM
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Protection against abuse and DDoS attacks
- **Comprehensive Logging**: Winston-based logging system
- **Input Validation**: Joi-based request validation
- **Error Handling**: Centralized error handling with custom error classes
- **AWS App Runner Ready**: Optimized for AWS App Runner deployment
- **Docker Support**: Containerized for consistent deployments
- **Health Checks**: Built-in health monitoring endpoints

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest
- **Containerization**: Docker

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL
- npm or yarn

### Installation

1. **Clone and setup**:
   ```bash
   cd nairagig_backend_v2
   npm install
   ```

2. **Environment setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database setup**:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run migrate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | Yes |
| `NODE_ENV` | Environment (development/production) | No |
| `PORT` | Server port | No |

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/verify-email` - Verify email address

### Health Check
- `GET /health` - Application health status

## Database Schema

The application uses Prisma with PostgreSQL and includes models for:

- **Users**: User accounts with roles and profiles
- **Jobs**: Freelance job postings
- **Applications**: Job applications from freelancers
- **Reviews**: User reviews and ratings
- **Challenges**: Coding challenges and competitions
- **Projects**: Project management and collaboration
- **Messages**: Real-time messaging system
- **Notifications**: User notifications
- **Transactions**: Payment and financial transactions

## Deployment

### AWS App Runner

1. **Build and push Docker image**:
   ```bash
   docker build -t nairagig-backend .
   docker tag nairagig-backend:latest your-ecr-repo:latest
   docker push your-ecr-repo:latest
   ```

2. **Deploy to App Runner**:
   - Use the included `apprunner.yaml` configuration
   - Set environment variables in App Runner console
   - Configure database connection

### Local Docker

```bash
# Build image
docker build -t nairagig-backend .

# Run container
docker run -p 3000:3000 --env-file .env nairagig-backend
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

### Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── routes/          # API routes
├── services/        # Business logic
├── utils/           # Utility functions
├── types/           # TypeScript type definitions
└── server.ts        # Application entry point
```

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request rate limiting
- **Input Validation**: Request validation
- **JWT**: Secure authentication
- **Password Hashing**: bcrypt password hashing
- **SQL Injection Protection**: Prisma ORM protection

## Monitoring & Logging

- **Winston Logging**: Structured logging with multiple transports
- **Health Checks**: Built-in health monitoring
- **Error Tracking**: Comprehensive error handling and logging
- **Performance Monitoring**: Request timing and metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is proprietary and confidential.