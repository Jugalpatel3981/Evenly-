// Phones come back here from Google sign-in (evenly://auth). The sign-in screen finishes the job.
import { Redirect } from 'expo-router';

export default function AuthReturn(){
  return <Redirect href="/" />;
}
