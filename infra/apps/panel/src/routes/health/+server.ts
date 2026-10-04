// What host asks after a deploy: the panel's server is up. Whether host answers is not asked, so a
// panel stays up to say that it does not.
export const GET = () => Response.json({ status: 'success', data: null });
