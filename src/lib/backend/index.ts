import axios from "axios";

export const backend = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});
