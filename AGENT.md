# Gallery Manager - Agent Instructions

## Build Commands
- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Type Check**: `npx tsc --noEmit`

## Project Structure
- React + TypeScript + Vite
- Tailwind CSS for styling
- React Router for navigation
- OAuth integration with Imgur API

## Key Files
- `/src/services/auth.ts` - OAuth authentication service
- `/src/services/imgur.ts` - Imgur API client
- `/src/types/imgur.ts` - TypeScript type definitions
- `/src/components/` - React components

## Environment Variables
- Copy `.env.example` to `.env` and configure Imgur API credentials
- `VITE_IMGUR_CLIENT_ID` - Your Imgur app client ID
- `VITE_IMGUR_CLIENT_SECRET` - Your Imgur app client secret
- `VITE_IMGUR_REDIRECT_URI` - OAuth callback URL (default: http://localhost:5173/auth/callback)

## Code Style
- Use TypeScript strict mode
- Functional components with hooks
- Tailwind CSS for styling
- Error handling with try/catch
- No inline styles, use Tailwind classes
