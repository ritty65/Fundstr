export async function verifyMint(url: string): Promise<boolean | null> {
  let resp: Response;
  try {
    resp = await fetch(`${url}/v1/info`);
  } catch {
    return null;
  }

  if (!resp.ok) {
    return false;
  }

  try {
    const info = await resp.json();
    const nuts = info?.nuts || {};
    return (
      nuts["10"]?.supported === true &&
      nuts["11"]?.supported === true &&
      nuts["14"]?.supported === true
    );
  } catch {
    return false;
  }
}
