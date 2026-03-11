# Use Node.js LTS (v20)
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install --production

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 5015

# Start the server using the VPS entry point
CMD [ "node", "server.js" ]
