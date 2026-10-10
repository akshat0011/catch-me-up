import { Demo, Footer, Hero, How, Languages, Nav, Why } from "./components/Landing";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Demo />
        <Why />
        <How />
        <Languages />
      </main>
      <Footer />
    </>
  );
}
