Here are the exact curl commands for each of your endpoints. I recommend running these in a separate terminal window while your server is running in the first one.

1. Register a New User
This will create your first user in the SQLite database and hash the password.

```Bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123",
    "name": "Test User"
  }'
```
2. Login to Get Your JWT
Run this to log in. The response will contain your user details and a long string called token.

```Bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123"
  }'
  ```
(Copy the token value from the response, you will need it for the next steps!)

3. Fetch the User Profile (Protected Route)
Now, let's test the JWT middleware. Replace YOUR_TOKEN_HERE with the token you copied from the login response.

```Bash
curl -X GET http://localhost:5000/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
4. Upload a Resume Securely
To test the file upload and encryption, create a simple text file on your computer (e.g., dummy.txt) to act as the resume. Replace /path/to/your/dummy.txt with the actual path to that file, and use your token.

```Bash
curl -X POST http://localhost:5000/api/resume/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "resume=@/path/to/your/dummy.txt"
```
(If this works, you should see a new .enc encrypted file appear in your uploads folder!)

5. Check the Admin Dashboard
By default, the user we created has the role "USER". If you try to run this command, it should correctly reject you with a 403 Access denied error.

```Bash
curl -X GET http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
(To test a successful admin request, you can open Prisma Studio using bunx prisma studio in another terminal, manually change your user's role from "USER" to "ADMIN", log in again to get a new token, and retry the command).