"use client";
import { createContext, useContext } from "react";
import type { Role } from "./types";

/** The signed-in platform role, for components (like the permission-denied state) that sit outside page code. */
export const RoleContext = createContext<Role | null>(null);
export const useRole = () => useContext(RoleContext);
