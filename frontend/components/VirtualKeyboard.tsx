"use client";

import { useState, useEffect } from "react";

interface VirtualKeyboardProps {
  onComplete: (pin: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function VirtualKeyboard({ onComplete, onCancel, isLoading }: VirtualKeyboardProps) {
  const [keys, setKeys] = useState<number[]>([]);
  const [pin, setPin] = useState<string>("");

  // Randomize keys on mount
  useEffect(() => {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Fisher-Yates Shuffle
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    setKeys(digits);
  }, []);

  const handlePress = (digit: number) => {
    if (pin.length < 6) {
      const newPin = pin + digit.toString();
      setPin(newPin);
      if (newPin.length === 6) {
        onComplete(newPin); // Automatically submit when 6 digits are entered
      }
    }
  };

  const handleDelete = () => setPin((prev) => prev.slice(0, -1));
  const handleClear = () => setPin("");

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-6 rounded-xl w-full max-w-sm mx-auto shadow-2xl">
      <div className="text-center mb-6">
        <h3 className="text-white font-bold text-lg mb-2">Secure Authentication</h3>
        <p className="text-gray-400 text-sm">Use the virtual keypad to enter your 6-digit authenticator code.</p>
      </div>

      {/* PIN Display */}
      <div className="flex justify-center gap-3 mb-8">
        {[...Array(6)].map((_, i) => (
          <div 
            key={i} 
            className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-colors
              ${i < pin.length ? 'border-[#e85d26] text-[#e85d26]' : 'border-[#333] text-transparent'}`}
          >
            {i < pin.length ? '•' : ''}
          </div>
        ))}
      </div>

      {/* Randomized Keypad */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {keys.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handlePress(num)}
            disabled={isLoading || pin.length >= 6}
            className="h-14 bg-[#252525] hover:bg-[#333] text-white text-xl font-semibold rounded-lg transition-colors border border-[#333]"
          >
            {num}
          </button>
        ))}
        <button type="button" onClick={handleClear} disabled={isLoading} className="h-14 text-gray-400 font-semibold hover:text-white transition-colors">
          Clear
        </button>
        <button type="button" onClick={handleDelete} disabled={isLoading} className="h-14 text-red-400 font-semibold hover:text-red-300 transition-colors">
          Delete
        </button>
      </div>

      <button 
        onClick={onCancel}
        disabled={isLoading}
        className="w-full py-3 text-gray-400 font-semibold border border-[#333] rounded-lg hover:bg-[#252525] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}