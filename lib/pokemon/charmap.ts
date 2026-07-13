// Gen 3 (international) character encoding -> Unicode, enough to render
// nicknames and trainer names. Unmapped bytes render as "".

const MAP = new Array<string>(256).fill("");
MAP[0x00] = " ";
const set = (start: number, chars: string) => {
  for (let i = 0; i < chars.length; i++) MAP[start + i] = chars[i];
};
set(0xa1, "0123456789");
MAP[0xab] = "!";
MAP[0xac] = "?";
MAP[0xad] = ".";
MAP[0xae] = "-";
MAP[0xb0] = "…";
MAP[0xb1] = "“";
MAP[0xb2] = "”";
MAP[0xb3] = "‘";
MAP[0xb4] = "’";
MAP[0xb5] = "♂";
MAP[0xb6] = "♀";
MAP[0xb8] = ",";
MAP[0xba] = "/";
set(0xbb, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
set(0xd5, "abcdefghijklmnopqrstuvwxyz");

const TERMINATOR = 0xff;

export function decodeGen3Text(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b === TERMINATOR) break;
    out += MAP[b] ?? "";
  }
  return out.trim();
}
