/** @type {import('next').NextConfig} */
module.exports=(phase)=>({distDir:phase==='phase-development-server'?'.next-dev':'.next',reactStrictMode:true,transpilePackages:['@mgt/domain','@mgt/shared'],async rewrites(){return ['hub','v1'].map(prefix=>({source:'/api/'+prefix+'/:path*',destination:(process.env.PORTAL_API_ORIGIN||'http://127.0.0.1:3100')+'/api/'+prefix+'/:path*'}));}});



