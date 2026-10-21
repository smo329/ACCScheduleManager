import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
      }
    );
  }

  try {

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (!authHeader) {
      return jsonResponse(
        {
          error:
            "Not authenticated",
        },
        401
      );
    }


    const userClient =
      createClient(
        Deno.env.get(
          "SUPABASE_URL"
        )!,
        Deno.env.get(
          "SUPABASE_ANON_KEY"
        )!,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        }
      );


    const {
      data: userData,
      error: userError,
    } =
      await userClient
        .auth
        .getUser();


    if (
      userError ||
      !userData.user
    ) {
      return jsonResponse(
        {
          error:
            "Invalid login",
        },
        401
      );
    }


    const {
      first_name,
      last_name,
    } =
      await req.json();


    const firstName =
      String(
        first_name || ""
      ).trim();


    const lastName =
      String(
        last_name || ""
      ).trim();


    if (
      !firstName ||
      !lastName
    ) {
      return jsonResponse(
        {
          error:
            "First name and last name are required.",
        },
        400
      );
    }


    if (
      firstName.length > 100 ||
      lastName.length > 100
    ) {
      return jsonResponse(
        {
          error:
            "Name fields are too long.",
        },
        400
      );
    }

    const adminClient =
      createClient(
        Deno.env.get(
          "SUPABASE_URL"
        )!,
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        )!
      );



    /*
     * Only these two columns are ever
     * updated by this function.
     */
    const {
      error: updateError,
    } =
      await adminClient
        .from(
          "profiles"
        )
        .update({
          first_name:
            firstName,

          last_name:
            lastName,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          userData.user.id
        );


    if (
      updateError
    ) {
      return jsonResponse(
        {
          error:
            updateError.message,
        },
        400
      );
    }


    return jsonResponse({
      success: true,

      first_name:
        firstName,

      last_name:
        lastName,
    });

  } catch (
    error
  ) {


    console.error(
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      500
    );
  }
});
