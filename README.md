# Gallery Manager

A React-based gallery manager that connects to your Imgur account to view and manage your images.

## Features

- OAuth authentication with Imgur
- View your Imgur images in a responsive grid
- Delete images directly from the interface
- Image metadata display (dimensions, file size, views, etc.)
- Responsive design with Tailwind CSS

## Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Imgur API credentials:**
   - Go to [Imgur API Registration](https://api.imgur.com/oauth2/addclient)
   - Create a new application
   - Copy `.env.example` to `.env`
   - Fill in your Imgur credentials:
     ```
     VITE_IMGUR_CLIENT_ID=your_client_id_here
     VITE_IMGUR_CLIENT_SECRET=your_client_secret_here
     VITE_IMGUR_REDIRECT_URI=http://localhost:5173/auth/callback
     ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## Project Structure

- `src/services/auth.ts` - OAuth authentication service
- `src/services/imgur.ts` - Imgur API service for fetching/managing images
- `src/types/imgur.ts` - TypeScript interfaces for Imgur API responses
- `src/components/` - React components for the UI

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## API Capabilities

The app includes full CRUD operations for Imgur:
- Fetch user images and albums
- Upload new images
- Update image metadata
- Delete images
- Create and manage albums

## Deployment

### GitHub Pages (Automatic)

The app is configured to automatically deploy to GitHub Pages when you push to the main branch.

**Setup:**
1. Go to your repository Settings → Pages
2. Set Source to "GitHub Actions"
3. Add these secrets in Settings → Secrets and variables → Actions:
   - `VITE_IMGUR_CLIENT_ID` - Your Imgur app client ID
   - `VITE_IMGUR_CLIENT_SECRET` - Your Imgur app client secret  
   - `VITE_IMGUR_REDIRECT_URI` - Your production callback URL (e.g., `https://yourusername.github.io/gallery-manager/auth/callback`)

**Important:** Update your Imgur app's callback URL to match your GitHub Pages URL.

### Manual Deployment

You can also deploy manually using:
```bash
npm run deploy
```

This builds the project and pushes to the `gh-pages` branch.

## Tech Stack

- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Router for navigation
- Axios for HTTP requests
- GitHub Actions for CI/CD
