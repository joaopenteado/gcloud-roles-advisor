import * as core from "@actions/core";
import { google } from "googleapis";
import fs from "fs";

const iam = google.iam("v1");

function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

async function listAllRoles(auth) {
  const roles = [];
  let pageToken = undefined;

  do {
    const response = await iam.roles.list({
      auth,
      view: "FULL",
      pageSize: 1000,
      pageToken,
    });

    roles.push(...(response.data.roles || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return roles;
}

async function main() {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const now = new Date().toISOString();
    const roles = await listAllRoles(auth);
    const permissions = new Set();
    const rolesMap = new Map();

    for (const role of roles) {
      // Ensure custom roles are skipped
      // Technically not necessary, but just to be extra safe
      if (Array.isArray(role.includedPermissions) && role.name.startsWith("roles/")) {
        role.includedPermissions.forEach((perm) => permissions.add(perm));
        rolesMap.set(role.name, role.includedPermissions);
      }
    }

    const sortedPermissions = Array.from(permissions).sort();
    const output = {
      permissions: sortedPermissions,
      roles: Object.fromEntries(
        Array.from(rolesMap.entries()).map(([roleName, rolePermissions]) => [
          roleName,
          rolePermissions
            .map((perm) => binarySearch(sortedPermissions, perm))
            .filter((index) => index !== -1)
            .sort((a, b) => a - b),
        ]),
      ),
      lastUpdated: now,
    };

    fs.writeFileSync(core.getInput("output_file"), JSON.stringify(output));

    core.summary
      .addHeading("Result")
      .addRaw(`Permissions: ${sortedPermissions.length}`)
      .addEOL()
      .addRaw(`Roles: ${output.roles.length}`)
      .addEOL()
      .addSeparator()
      .write();

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
