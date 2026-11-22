// Which shipped models CREDITS.md does not account for. A model counts as credited when the file names its path
// (public/models/props/chair.glb), its file name (chair.glb), or a folder below public/models/ that holds it
// (public/models/props/ or models/props/): a site may credit a whole folder of its own or of one source in one line.
// public/models/ itself is too wide to count: every site's credits name it.

/**
 * @param {string[]} models paths of the site's models, relative to the site, with forward slashes
 * @param {string} credits the text of CREDITS.md
 * @returns {string[]} the models it does not mention
 */
export function uncredited(models, credits) {
  const text = credits.replace(/\\/g, '/');
  return models.filter((path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (text.includes(path) || text.includes(name)) return false;
    // a folder below public/models/, named with its trailing slash, from the site's root or from inside public/
    const parts = path.split('/');
    for (let n = parts.length - 1; n >= 3; n--) {
      const folder = `${parts.slice(0, n).join('/')}/`;
      if (text.includes(folder) || (folder.startsWith('public/') && text.includes(folder.slice('public/'.length)))) return false;
    }
    return true;
  });
}
