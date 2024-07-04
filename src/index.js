/**
 * This worker will make a mapping of device ids to virtual IPs and save the output to an R2 bucket. R2 bucket specified in wrangler.toml
 * Cron schedule defined in wrangler.toml
 */

export default {
	async scheduled(event, env, ctx) {
	  // Inputs for Cloudflare API calls. Stored locally in .dev.var and in the edge in Workers secrets
	  const accountId = env.ACCOUNT_ID;
	  const userEmail = env.USER_EMAIL;
	  const apiKey = env.API_KEY;
  
	  // STEP 01 - Get devices
	  const devicesUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/devices`;
	  const response = await fetch(devicesUrl, {
		method: 'GET',
		headers: {
		  'X-Auth-Email': userEmail,
		  'X-Auth-Key': apiKey,
		  'Content-Type': 'application/json'
		}
	  });
	  const data = await response.json();
	  console.log(data)
  
	  // STEP 02 - IF Response is OK, we get the WARP virtual IP for each of the device ids
	  // And we store the information fields we care about: device id, email of person associated, name of device, Virtual IP
	  if (response.ok) {
		const devices = data.result;
		const deviceInfo = [];
  
		for (let device of devices) {
		  let virtualIpUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/teamnet/devices/ips?device_ids[0]=${device.id}`;
		  let VirtualIpResponse = await fetch(virtualIpUrl, {
			method: 'GET',
			headers: {
			  'X-Auth-Email': userEmail,
			  'X-Auth-Key': apiKey,
			  'Content-Type': 'application/json'
			}
		  });
  
		  let VirtualIpData = await VirtualIpResponse.json();
  
		  if (VirtualIpResponse.ok) {
			let VirtualIps = VirtualIpData.result;
  
			deviceInfo.push({
			  id: device.id,
			  email: device.user.email,
			  name: device.name,
			  version: VirtualIps[0].device_ips.ipv4
			});
		  } else {
			deviceInfo.push({
			  id: device.id,
			  email: device.user.email,
			  name: device.name,
			  version: 'Unknown'  // Handle case where details could not be fetched
			});
		  }
		}
  
		// Convert to JSON format
		const jsonOutput = JSON.stringify(deviceInfo, null, 2);
  
		// Save the JSON to R2 bucket
		const objectName = `warp_vips_${new Date().toISOString()}.json`;
		const uploadFile = new Blob([jsonOutput], { type: 'application/json' });
		await env.MY_BUCKET.put(objectName, uploadFile);
  
	  } else {
		console.error(`Error fetching devices: ${JSON.stringify(data)}`);
	  }
	}
  };