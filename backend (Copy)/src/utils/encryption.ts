import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

// save the file after encrypting the file 
export const encryptFile = (buffer: Buffer, originalFilename: string) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  const encryptedBuffer = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const fileName = `${Date.now()}-${originalFilename}.enc`;
  
  // saves the files to the uploads fodler 
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, encryptedBuffer);
  
  return { filepath: filePath, iv: iv.toString('hex') };
};